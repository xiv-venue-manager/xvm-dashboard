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
  venueTimezones: ReadonlyMap<string, string>
  now: Date
}

export interface ShiftRuleRow {
  key: string
  venue_key: string
  interval: "weekly" | "biweekly"
  weekday: number
  start_minute_of_day: number
  duration_minutes: number
  timezone: string
  anchor_date: string
  enabled: boolean
}

export interface ShiftRow {
  key: string
  venue_key: string
  membership_key: string | null
  position_key: string | null
  event_key: string | null
  rule_key: string | null
  slot_index: number
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  claimed_at: string | null
  approved_at: string | null
  approved_by_person_key: string | null
  cancelled_at: string | null
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
  rules: ShiftRuleRow[]
  shifts: ShiftRow[]
  audits: AuditRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_NOTE = 200
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
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function localParts(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: DAY_NAMES.indexOf(parts.weekday),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

const byTime = (a: ExportedShift, b: ExportedShift) => a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id)
const byCreated = (a: ExportedShift, b: ExportedShift) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

export function mapShifts(source: ShiftsExport, ctx: ShiftContext): ShiftsResult {
  const result: ShiftsResult = { rules: [], shifts: [], audits: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const byId = new Map(source.shifts.map((s) => [s.id, s]))
  const rootOf = (shift: ExportedShift): ExportedShift | null => {
    let current = shift
    for (let hops = 0; hops < 1000; hops++) {
      if (!current.parentShiftId) return current
      const parent = byId.get(current.parentShiftId)
      if (!parent) return null
      current = parent
    }
    return null
  }

  const auditsByShift = new Map<string, ExportedAudit[]>()
  for (const a of [...source.audits].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))) {
    auditsByShift.set(a.shiftId, [...(auditsByShift.get(a.shiftId) ?? []), a])
  }

  const ruleOf = new Map<string, { rule: string; slot: number }>()
  const blocked = new Set<string>()
  const roots = source.shifts.filter((s) => s.recurrenceRule && !s.parentShiftId).sort(byCreated)
  const groups = new Map<string, ExportedShift[]>()
  for (const root of roots) groups.set(root.slotGroupId ?? root.id, [...(groups.get(root.slotGroupId ?? root.id) ?? []), root])

  for (const chains of groups.values()) {
    const first = chains[0]
    const chainIds = new Set(chains.map((c) => c.id))
    const members = source.shifts.filter((s) => {
      const root = rootOf(s)
      return root !== null && chainIds.has(root.id)
    }).sort(byTime)

    const tz = ctx.venueTimezones.get(first.venueId) ?? "UTC"
    const interval = first.recurrenceRule === "BIWEEKLY" ? "biweekly" : first.recurrenceRule === "WEEKLY" ? "weekly" : null
    if (interval === null) {
      for (const m of members) {
        blocked.add(m.id)
        skip(m.id, `unknown recurrence ${JSON.stringify(first.recurrenceRule)}`)
      }
      continue
    }
    if (chains.some((c) => c.recurrenceRule !== first.recurrenceRule)) {
      warn(first.id, "chains in one slot group have different recurrences, used the first")
    }

    const locals = members.map((m) => localParts(m.scheduledStart, tz))
    const minute = mostCommon(locals.map((l) => l.minuteOfDay))
    const moved = locals.filter((l) => l.minuteOfDay !== minute).length
    if (moved > 0) {
      warn(first.id, `${moved} of ${members.length} shifts start at a different local time than the series, daylight saving or an edit, their real times are kept and xvm-api has no separate canonical slot for shifts`)
    }

    result.rules.push({
      key: first.id,
      venue_key: first.venueId,
      interval,
      weekday: mostCommon(locals.map((l) => l.weekday)),
      start_minute_of_day: minute,
      duration_minutes: mostCommon(members.map((m) => Math.round((new Date(m.scheduledEnd).getTime() - new Date(m.scheduledStart).getTime()) / 60000))),
      timezone: tz,
      anchor_date: locals[0].date,
      enabled: true,
    })
    chains.forEach((chain, slot) => {
      for (const m of members) if (rootOf(m)?.id === chain.id) ruleOf.set(m.id, { rule: first.id, slot })
    })
  }

  const usedSlots = new Set<string>()
  const closeAtScheduledEnd: ExportedShift[] = []

  for (const s of [...source.shifts].sort(byTime)) {
    if (blocked.has(s.id)) continue
    if (s.parentShiftId && !ruleOf.has(s.id)) {
      skip(s.id, byId.has(s.parentShiftId) ? "belongs to a series that was not mapped" : "parent shift not found")
      continue
    }
    if (s.membershipId !== null && ctx.memberships.get(s.membershipId) !== s.venueId) {
      skip(s.id, "membership was not loaded")
      continue
    }
    const series = ruleOf.get(s.id) ?? null
    if (series) {
      const slotKey = `${series.rule}|${s.scheduledStart}|${series.slot}`
      if (usedSlots.has(slotKey)) {
        skip(s.id, "same series, start and slot as an earlier shift")
        continue
      }
      usedSlots.add(slotKey)
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

    const logs = auditsByShift.get(s.id) ?? []
    const claim = logs.find((l) => l.action === "CLAIM")
    const approve = logs.find((l) => l.action === "APPROVE")
    const assigned = s.membershipId !== null
    const claimedAt = assigned ? (claim?.createdAt ?? s.createdAt) : null
    const approvedAt = assigned && s.status !== "CLAIMED" ? (approve?.createdAt ?? s.createdAt) : null
    const approver = approve?.actorUserId && ctx.personKeys.has(approve.actorUserId) ? approve.actorUserId : null

    let actualEnd = s.actualEnd
    if (s.actualStart !== null && s.actualEnd === null) {
      if (new Date(s.scheduledEnd).getTime() <= ctx.now.getTime()) {
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
      membership_key: s.membershipId,
      position_key: positionKey,
      event_key: eventKey,
      rule_key: series?.rule ?? null,
      slot_index: series?.slot ?? 0,
      scheduled_start: s.scheduledStart,
      scheduled_end: s.scheduledEnd,
      actual_start: s.actualStart,
      actual_end: actualEnd,
      claimed_at: claimedAt,
      approved_at: approvedAt,
      approved_by_person_key: approvedAt ? approver : null,
      cancelled_at: s.status === "CANCELLED" ? s.updatedAt : null,
      notes: s.notes === null ? null : s.notes.trim() || null,
      reminder_sent_at: s.remindedAt,
      payroll_entry_key: s.payrollEntryId,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    })
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

  return result
}
