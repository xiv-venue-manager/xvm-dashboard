export interface ExportedShift {
  id: string
  venueId: string
  membershipId: string | null
  roleId: string | null
  eventId: string | null
  payrollEntryId: string | null
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  status: "OPEN" | "CLAIMED" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "MISSED" | "CANCELLED"
  notes: string | null
  recurrenceRule: string | null
  parentShiftId: string | null
  slotGroupId: string | null
  remindedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExportedAudit {
  id: string
  shiftId: string
  action: string
  actorUserId: string | null
  source: string
  createdAt: string
}

export interface ShiftsExport {
  shifts: ExportedShift[]
  audits: ExportedAudit[]
}

export interface ShiftContext {
  personKeys: ReadonlySet<string>
  memberships: ReadonlyMap<string, string>
  positions: ReadonlyMap<string, string>
  eventKeys: ReadonlySet<string>
  now: Date
}

export interface EventPositionRow {
  key: string
  venue_key: string
  event_key: string
  position_key: string
  sort_order: number
}

export interface EventShiftRow {
  key: string
  venue_key: string
  event_position_key: string
  starts_at: string
  ends_at: string
  capacity: number
  cancelled_at: string | null
  cancel_reason: string | null
}

export interface ShiftRow {
  key: string
  venue_key: string
  membership_key: string
  position_key: string | null
  event_key: string | null
  event_shift_key: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  claimed_at: string | null
  approved_at: string | null
  approved_by_person_key: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  notes: string | null
  reminder_sent_at: string | null
  payroll_entry_key: string | null
  created_at: string
  updated_at: string
}

export interface AuditRow {
  shift_key: string
  action: "claim" | "approve" | "reject" | "clock_in" | "clock_out" | "cancel"
  actor_person_key: string | null
  source: "dashboard" | "plugin" | "bot" | "system"
  note: string | null
  created_at: string
}

export interface ShiftsResult {
  event_positions: EventPositionRow[]
  event_shifts: EventShiftRow[]
  shifts: ShiftRow[]
  audits: AuditRow[]
  folded_open_slots: number
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_NOTE = 200
const MAX_EVENT_SHIFT_CAPACITY = 99
const TWIN = "Converted: the same person held another seat on this shift."
const ACTIONS: Record<string, AuditRow["action"]> = {
  CLAIM: "claim",
  APPROVE: "approve",
  REJECT: "reject",
  CLOCK_IN: "clock_in",
  CLOCK_OUT: "clock_out",
  CANCEL_SERIES: "cancel",
}
const SOURCES: Record<string, AuditRow["source"]> = {
  web: "dashboard",
  admin: "dashboard",
  plugin: "plugin",
  discord: "bot",
  "xiv-admin": "system",
}

const byTime = (a: ExportedShift, b: ExportedShift) => a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id)
const worked = (s: ExportedShift) => s.actualStart !== null
const live = (s: ExportedShift) => s.status !== "CANCELLED"

interface Slot {
  venueId: string
  eventKey: string
  positionKey: string
  start: string
  end: string
  rows: ExportedShift[]
}

export function mapShifts(source: ShiftsExport, ctx: ShiftContext): ShiftsResult {
  const result: ShiftsResult = { event_positions: [], event_shifts: [], shifts: [], audits: [], folded_open_slots: 0, skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const auditsByShift = new Map<string, ExportedAudit[]>()
  for (const a of [...source.audits].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))) {
    auditsByShift.set(a.shiftId, [...(auditsByShift.get(a.shiftId) ?? []), a])
  }

  const slots = new Map<string, Slot>()
  const walkIns: ExportedShift[] = []
  const positionOf = new Map<string, string | null>()
  const eventOf = new Map<string, string | null>()

  for (const s of [...source.shifts].sort(byTime)) {
    if (s.membershipId !== null && ctx.memberships.get(s.membershipId) !== s.venueId) {
      skip(s.id, "membership was not loaded")
      continue
    }

    let positionKey: string | null = null
    if (s.roleId !== null) {
      if (ctx.positions.get(s.roleId) === s.venueId) positionKey = s.roleId
      else warn(s.id, "position was not loaded, left empty")
    }
    let eventKey: string | null = null
    if (s.eventId !== null) {
      if (ctx.eventKeys.has(s.eventId)) eventKey = s.eventId
      else warn(s.id, "event was not loaded, left empty")
    }
    positionOf.set(s.id, positionKey)
    eventOf.set(s.id, eventKey)

    if (eventKey !== null && positionKey !== null) {
      const slotKey = [s.venueId, eventKey, positionKey, s.scheduledStart, s.scheduledEnd].join("|")
      const slot = slots.get(slotKey) ?? { venueId: s.venueId, eventKey, positionKey, start: s.scheduledStart, end: s.scheduledEnd, rows: [] }
      slot.rows.push(s)
      slots.set(slotKey, slot)
      continue
    }
    if (s.membershipId !== null && worked(s)) {
      walkIns.push(s)
      continue
    }
    skip(s.id, s.membershipId === null ? "open slot with no event or position" : "not worked, and no event or position to seat it on")
  }

  interface Placed {
    shift: ExportedShift
    eventShiftKey: string | null
    cancelledAt: string | null
    cancelReason: string | null
  }
  const placed: Placed[] = []
  const eventPositionKeys = new Map<string, string>()

  for (const slot of slots.values()) {
    const pairKey = `${slot.eventKey}|${slot.positionKey}`
    let eventPositionKey = eventPositionKeys.get(pairKey)
    if (eventPositionKey === undefined) {
      eventPositionKey = `ep-${slot.eventKey}-${slot.positionKey}`
      eventPositionKeys.set(pairKey, eventPositionKey)
      result.event_positions.push({
        key: eventPositionKey,
        venue_key: slot.venueId,
        event_key: slot.eventKey,
        position_key: slot.positionKey,
        sort_order: 0,
      })
    }

    const sharedKey = `es-${slot.rows[0].id}`
    const held = new Set<string>()
    const apart: Placed[] = []
    let seated = 0
    let open = 0
    const ordered = [...slot.rows].sort((a, b) => Number(!worked(a)) - Number(!worked(b)) || a.id.localeCompare(b.id))
    for (const row of ordered) {
      if (row.membershipId === null) {
        result.folded_open_slots++
        if (live(row)) open++
        continue
      }
      const cancelledAt = live(row) ? null : row.updatedAt
      if (live(row) && held.has(row.membershipId)) {
        if (worked(row)) {
          apart.push({ shift: row, eventShiftKey: `es-${row.id}`, cancelledAt: null, cancelReason: null })
        } else {
          placed.push({ shift: row, eventShiftKey: sharedKey, cancelledAt: row.updatedAt, cancelReason: TWIN })
        }
        continue
      }
      if (live(row)) {
        held.add(row.membershipId)
        seated++
      }
      placed.push({ shift: row, eventShiftKey: sharedKey, cancelledAt, cancelReason: null })
    }

    const allCancelled = slot.rows.every((r) => !live(r))
    const capacity = Math.max(seated + open, 1)
    if (capacity > MAX_EVENT_SHIFT_CAPACITY) warn(sharedKey, `capacity ${capacity} is over xvm-api's limit of ${MAX_EVENT_SHIFT_CAPACITY}, split this slot by hand`)
    result.event_shifts.push({
      key: sharedKey,
      venue_key: slot.venueId,
      event_position_key: eventPositionKey,
      starts_at: slot.start,
      ends_at: slot.end,
      capacity,
      cancelled_at: allCancelled ? slot.rows.map((r) => r.updatedAt).sort().at(-1) ?? null : null,
      cancel_reason: null,
    })
    for (const row of apart) {
      result.event_shifts.push({
        key: row.eventShiftKey as string,
        venue_key: slot.venueId,
        event_position_key: eventPositionKey,
        starts_at: slot.start,
        ends_at: slot.end,
        capacity: 1,
        cancelled_at: null,
        cancel_reason: null,
      })
      placed.push(row)
    }
  }
  for (const s of walkIns) placed.push({ shift: s, eventShiftKey: null, cancelledAt: live(s) ? null : s.updatedAt, cancelReason: null })

  const closeAtScheduledEnd: ExportedShift[] = []
  for (const { shift: s, eventShiftKey, cancelledAt, cancelReason } of placed.sort((a, b) => byTime(a.shift, b.shift))) {
    const logs = auditsByShift.get(s.id) ?? []
    const claim = logs.find((l) => l.action === "CLAIM")
    const approve = logs.find((l) => l.action === "APPROVE")
    const claimedAt = claim?.createdAt ?? s.createdAt
    const approvedAt = s.status !== "CLAIMED" ? (approve?.createdAt ?? s.createdAt) : null
    const approver = approve?.actorUserId && ctx.personKeys.has(approve.actorUserId) ? approve.actorUserId : null

    let actualEnd = s.actualEnd
    if (s.actualStart !== null && s.actualEnd === null) {
      if (new Date(s.scheduledEnd).getTime() <= new Date(s.actualStart).getTime()) {
        warn(s.id, "still clocked in and clocked in at or after its scheduled end, needs a manual call")
      } else if (new Date(s.scheduledEnd).getTime() <= ctx.now.getTime()) {
        actualEnd = s.scheduledEnd
        closeAtScheduledEnd.push(s)
        warn(s.id, "still clocked in, ended at its scheduled end")
      } else {
        warn(s.id, "still clocked in and its scheduled end is in the future, needs a manual call")
      }
    }

    result.shifts.push({
      key: s.id,
      venue_key: s.venueId,
      membership_key: s.membershipId as string,
      position_key: positionOf.get(s.id) ?? null,
      event_key: eventOf.get(s.id) ?? null,
      event_shift_key: eventShiftKey,
      scheduled_start: eventShiftKey === null ? null : s.scheduledStart,
      scheduled_end: eventShiftKey === null ? null : s.scheduledEnd,
      actual_start: s.actualStart,
      actual_end: actualEnd,
      claimed_at: claimedAt,
      approved_at: approvedAt,
      approved_by_person_key: approvedAt ? approver : null,
      cancelled_at: cancelledAt,
      cancel_reason: cancelReason,
      notes: s.notes === null ? null : s.notes.trim() || null,
      reminder_sent_at: s.remindedAt,
      payroll_entry_key: s.payrollEntryId,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    })
  }

  const stillClockedIn = new Map<string, string[]>()
  for (const s of result.shifts) {
    if (s.actual_start !== null && s.actual_end === null) stillClockedIn.set(s.membership_key, [...(stillClockedIn.get(s.membership_key) ?? []), s.key])
  }
  for (const [membership, keys] of stillClockedIn) {
    if (keys.length > 1) warn(membership, `${keys.length} shifts are still clocked in (${keys.join(", ")}), xvm-api allows one open clock per person`)
  }

  const kept = new Set(result.shifts.map((s) => s.key))
  for (const [shiftId, logs] of auditsByShift) {
    if (!kept.has(shiftId)) {
      for (const l of logs) skip(l.id, "its shift was not loaded")
      continue
    }
    for (const l of logs) {
      const action = ACTIONS[l.action]
      if (!action) {
        skip(l.id, `unknown audit action ${JSON.stringify(l.action)}`)
        continue
      }
      const mapped = SOURCES[l.source]
      const notes: string[] = []
      if (l.action === "CANCEL_SERIES") notes.push("cancelled with its series")
      if (!mapped) notes.push(`original source: ${l.source}`)
      result.audits.push({
        shift_key: shiftId,
        action,
        actor_person_key: l.actorUserId && ctx.personKeys.has(l.actorUserId) ? l.actorUserId : null,
        source: mapped ?? "system",
        note: notes.length ? notes.join("; ").slice(0, MAX_NOTE) : null,
        created_at: l.createdAt,
      })
    }
  }
  for (const s of closeAtScheduledEnd) {
    result.audits.push({
      shift_key: s.id,
      action: "clock_out",
      actor_person_key: null,
      source: "system",
      note: "closed at its scheduled end during migration",
      created_at: s.scheduledEnd,
    })
  }
  for (const p of placed) {
    if (p.cancelReason === TWIN) {
      result.audits.push({
        shift_key: p.shift.id,
        action: "cancel",
        actor_person_key: null,
        source: "system",
        note: TWIN,
        created_at: p.cancelledAt as string,
      })
    }
  }

  return result
}
