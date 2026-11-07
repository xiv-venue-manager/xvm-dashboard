import type { ExportedShift } from "./shifts"

export interface UnseatedInput {
  shifts: ExportedShift[]
  roles: { id: string; name: string }[]
  memberships: { id: string; nickname: string | null; userId: string }[]
  users: { id: string; displayName: string | null; name: string | null }[]
  venues: { id: string; name: string }[]
  skippedShiftKeys: ReadonlySet<string>
  now: Date
}

export interface UnseatedSeries {
  member: string
  role: string | null
  recurrenceRule: string | null
  shifts: { start: string; end: string; status: string; notes: string | null }[]
}

export interface UnseatedVenue {
  venue: string
  shiftCount: number
  series: UnseatedSeries[]
}

const LIVE = new Set(["SCHEDULED", "CLAIMED"])

export function unseatedShifts(input: UnseatedInput): UnseatedVenue[] {
  const roles = new Map(input.roles.map((r) => [r.id, r.name]))
  const users = new Map(input.users.map((u) => [u.id, u]))
  const members = new Map(input.memberships.map((m) => [m.id, m]))
  const venues = new Map(input.venues.map((v) => [v.id, v.name]))
  const byId = new Map(input.shifts.map((s) => [s.id, s]))

  const pending = input.shifts.filter(
    (s) =>
      input.skippedShiftKeys.has(s.id) &&
      s.membershipId !== null &&
      LIVE.has(s.status) &&
      s.actualStart === null &&
      new Date(s.scheduledStart).getTime() >= input.now.getTime()
  )

  const groups = new Map<string, ExportedShift[]>()
  for (const s of pending) {
    const key = `${s.venueId}|${s.parentShiftId ?? s.id}|${s.membershipId}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }

  const perVenue = new Map<string, UnseatedSeries[]>()
  for (const rows of groups.values()) {
    rows.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    const first = rows[0]
    const m = members.get(first.membershipId!)
    const u = m ? users.get(m.userId) : undefined
    const parent = first.parentShiftId ? byId.get(first.parentShiftId) : first
    const series: UnseatedSeries = {
      member: m?.nickname ?? u?.displayName ?? u?.name ?? first.membershipId!,
      role: first.roleId ? (roles.get(first.roleId) ?? null) : null,
      recurrenceRule: parent?.recurrenceRule ?? first.recurrenceRule,
      shifts: rows.map((r) => ({ start: r.scheduledStart, end: r.scheduledEnd, status: r.status, notes: r.notes })),
    }
    perVenue.set(first.venueId, [...(perVenue.get(first.venueId) ?? []), series])
  }

  return [...perVenue.entries()]
    .map(([id, series]) => ({
      venue: venues.get(id) ?? id,
      shiftCount: series.reduce((n, s) => n + s.shifts.length, 0),
      series: series.sort((a, b) => a.member.localeCompare(b.member)),
    }))
    .sort((a, b) => a.venue.localeCompare(b.venue))
}

export function renderUnseatedShifts(venues: UnseatedVenue[]): string {
  const total = venues.reduce((n, v) => n + v.shiftCount, 0)
  const lines = [`# Upcoming shifts that did not carry over (${total} shifts, ${venues.length} venues)`, ""]
  for (const v of venues) {
    lines.push(`## ${v.venue} (${v.shiftCount})`, "")
    for (const s of v.series) {
      lines.push(
        `- ${s.member}${s.role ? `, ${s.role}` : ""}${s.recurrenceRule ? `, repeats: ${s.recurrenceRule}` : ""}`
      )
      for (const r of s.shifts)
        lines.push(`  - ${r.start} to ${r.end} UTC (${r.status.toLowerCase()})${r.notes ? `: ${r.notes}` : ""}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}
