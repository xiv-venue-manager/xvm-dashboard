import { describe, it, expect } from "vitest"
import { mapShifts, type ExportedAudit, type ExportedShift, type ShiftContext } from "./shifts"

const shift = (over: Partial<ExportedShift> = {}): ExportedShift => ({
  id: "s1",
  venueId: "v1",
  membershipId: null,
  roleId: null,
  eventId: null,
  payrollEntryId: null,
  scheduledStart: "2026-01-05T19:00:00.000Z",
  scheduledEnd: "2026-01-05T22:00:00.000Z",
  actualStart: null,
  actualEnd: null,
  status: "OPEN",
  notes: null,
  recurrenceRule: null,
  parentShiftId: null,
  slotGroupId: null,
  remindedAt: null,
  createdAt: "2025-12-20T10:00:00.000Z",
  updatedAt: "2025-12-21T10:00:00.000Z",
  ...over,
})

const audit = (over: Partial<ExportedAudit> = {}): ExportedAudit => ({
  id: "a1",
  shiftId: "s1",
  action: "CLAIM",
  actorUserId: "u1",
  source: "web",
  createdAt: "2025-12-22T10:00:00.000Z",
  ...over,
})

const ctx = (over: Partial<ShiftContext> = {}): ShiftContext => ({
  personKeys: new Set(["u1", "u2"]),
  memberships: new Map([["m1", "v1"]]),
  positions: new Map([["r1", "v1"]]),
  eventKeys: new Set(["e1"]),
  venueTimezones: new Map(),
  now: new Date("2026-10-09T00:00:00.000Z"),
  ...over,
})

const run = (shifts: ExportedShift[], audits: ExportedAudit[] = [], c: ShiftContext = ctx()) => mapShifts({ shifts, audits }, c)

describe("states", () => {
  it("maps an open slot with no claim or approval", () => {
    const r = run([shift()])
    expect(r.shifts[0]).toMatchObject({ key: "s1", membership_key: null, claimed_at: null, approved_at: null, cancelled_at: null, rule_key: null, slot_index: 0 })
  })

  it("stamps a scheduled shift claimed and approved at creation when there is no audit trail", () => {
    const r = run([shift({ membershipId: "m1", status: "SCHEDULED" })])
    expect(r.shifts[0]).toMatchObject({ claimed_at: "2025-12-20T10:00:00.000Z", approved_at: "2025-12-20T10:00:00.000Z" })
  })

  it("takes the claim and approval times, and the approver, from the audit log", () => {
    const r = run(
      [shift({ membershipId: "m1", status: "SCHEDULED" })],
      [audit({ id: "c", action: "CLAIM", createdAt: "2025-12-22T10:00:00.000Z" }), audit({ id: "p", action: "APPROVE", actorUserId: "u2", createdAt: "2025-12-23T10:00:00.000Z" })]
    )
    expect(r.shifts[0]).toMatchObject({ claimed_at: "2025-12-22T10:00:00.000Z", approved_at: "2025-12-23T10:00:00.000Z", approved_by_person_key: "u2" })
  })

  it("leaves a claimed shift waiting for approval", () => {
    const r = run([shift({ membershipId: "m1", status: "CLAIMED" })])
    expect(r.shifts[0].claimed_at).not.toBeNull()
    expect(r.shifts[0].approved_at).toBeNull()
  })

  it("dates a cancelled shift by its last update", () => {
    const r = run([shift({ status: "CANCELLED" }), shift({ id: "s2", status: "CANCELLED", membershipId: "m1", scheduledStart: "2026-01-06T19:00:00.000Z", scheduledEnd: "2026-01-06T22:00:00.000Z" })])
    expect(r.shifts.map((s) => s.cancelled_at)).toEqual(["2025-12-21T10:00:00.000Z", "2025-12-21T10:00:00.000Z"])
    expect(r.shifts[0].claimed_at).toBeNull()
  })

  it("keeps the actual times of a completed shift", () => {
    const r = run([shift({ membershipId: "m1", status: "COMPLETED", actualStart: "2026-01-05T19:05:00.000Z", actualEnd: "2026-01-05T21:50:00.000Z" })])
    expect(r.shifts[0]).toMatchObject({ actual_start: "2026-01-05T19:05:00.000Z", actual_end: "2026-01-05T21:50:00.000Z" })
  })

  it("ends a shift still clocked in at its scheduled end, with a clock-out entry", () => {
    const r = run([shift({ membershipId: "m1", status: "ACTIVE", actualStart: "2026-01-05T19:05:00.000Z" })])
    expect(r.shifts[0].actual_end).toBe("2026-01-05T22:00:00.000Z")
    expect(r.audits).toEqual([
      { shift_key: "s1", action: "clock_out", actor_person_key: null, source: "system", note: "closed at its scheduled end during migration", created_at: "2026-01-05T22:00:00.000Z" },
    ])
    expect(r.warnings[0].message).toContain("ended at its scheduled end")
  })

  it("leaves a clocked-in shift that has not finished open, and says it needs a manual call", () => {
    const r = run([shift({ membershipId: "m1", status: "ACTIVE", actualStart: "2026-10-09T19:05:00.000Z", scheduledStart: "2026-10-09T19:00:00.000Z", scheduledEnd: "2026-10-09T22:00:00.000Z" })])
    expect(r.shifts[0].actual_end).toBeNull()
    expect(r.warnings[0].message).toContain("manual call")
    expect(r.audits).toEqual([])
  })

  it("carries the position, event, payroll link, reminder and notes", () => {
    const r = run([shift({ roleId: "r1", eventId: "e1", payrollEntryId: "pay1", remindedAt: "2026-01-05T18:00:00.000Z", notes: " cover ", membershipId: "m1", status: "SCHEDULED" })])
    expect(r.shifts[0]).toMatchObject({ position_key: "r1", event_key: "e1", payroll_entry_key: "pay1", reminder_sent_at: "2026-01-05T18:00:00.000Z", notes: "cover" })
  })

  it("leaves an unloaded position or event empty, with a warning each", () => {
    const r = run([shift({ roleId: "gone", eventId: "gone" })])
    expect(r.shifts[0]).toMatchObject({ position_key: null, event_key: null })
    expect(r.warnings).toHaveLength(2)
  })

  it("skips a shift whose membership was not loaded or belongs to another venue", () => {
    const r = run([shift({ id: "a", membershipId: "gone" }), shift({ id: "b", membershipId: "m1", venueId: "v2" })])
    expect(r.shifts).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(["membership was not loaded", "membership was not loaded"])
  })
})

describe("audit entries", () => {
  const mapped = (over: Partial<ExportedAudit>) => run([shift({ membershipId: "m1", status: "SCHEDULED" })], [audit(over)]).audits[0]

  it("lower-cases the action and renames the source", () => {
    expect(mapped({ action: "CLOCK_OUT", source: "plugin" })).toMatchObject({ action: "clock_out", source: "plugin" })
    expect(mapped({ action: "CLOCK_IN", source: "web" })).toMatchObject({ action: "clock_in", source: "dashboard" })
    expect(mapped({ action: "APPROVE", source: "admin" })).toMatchObject({ action: "approve", source: "dashboard" })
    expect(mapped({ action: "CLOCK_IN", source: "discord" })).toMatchObject({ source: "bot" })
    expect(mapped({ action: "CLOCK_OUT", source: "xiv-admin" })).toMatchObject({ source: "system", note: null })
  })

  it("keeps the original source of a manual edit in the note", () => {
    expect(mapped({ action: "CLOCK_OUT", source: "manual_backdate" })).toMatchObject({ source: "system", note: "original source: manual_backdate" })
  })

  it("turns a series cancellation into a cancel entry with a note", () => {
    expect(mapped({ action: "CANCEL_SERIES" })).toMatchObject({ action: "cancel", note: "cancelled with its series" })
  })

  it("leaves the actor empty when that person was not loaded", () => {
    expect(mapped({ actorUserId: "ghost" }).actor_person_key).toBeNull()
  })

  it("skips an unknown action, and an entry whose shift was not loaded", () => {
    const r = run([shift({ membershipId: "gone" })], [audit({ id: "x", shiftId: "s1" }), audit({ id: "y", shiftId: "other" })])
    expect(r.audits).toEqual([])
    const r2 = run([shift({ membershipId: "m1", status: "SCHEDULED" })], [audit({ id: "z", action: "TELEPORT" })])
    expect(r2.skipped).toEqual([{ key: "z", reason: 'unknown audit action "TELEPORT"' }])
  })
})

describe("series", () => {
  const week = (id: string, day: number, over: Partial<ExportedShift> = {}) => {
    const start = new Date(Date.UTC(2026, 0, 5 + day, 19)).toISOString()
    const end = new Date(Date.UTC(2026, 0, 5 + day, 22)).toISOString()
    return shift({ id, scheduledStart: start, scheduledEnd: end, ...over })
  }

  it("turns a weekly parent and its children into one rule with tied shifts", () => {
    const r = run([week("c1", 7, { parentShiftId: "p" }), week("p", 0, { recurrenceRule: "WEEKLY" })])
    expect(r.rules).toEqual([
      { key: "p", venue_key: "v1", interval: "weekly", weekday: 0, start_minute_of_day: 1140, duration_minutes: 180, timezone: "UTC", anchor_date: "2026-01-05", enabled: true },
    ])
    expect(r.shifts.map((s) => [s.key, s.rule_key, s.slot_index])).toEqual([["p", "p", 0], ["c1", "p", 0]])
  })

  it("maps biweekly", () => {
    expect(run([week("p", 0, { recurrenceRule: "BIWEEKLY" })]).rules[0].interval).toBe("biweekly")
  })

  it("gives the chains of one slot group one rule and a slot index each", () => {
    const r = run([
      week("a", 0, { recurrenceRule: "WEEKLY", slotGroupId: "g", createdAt: "2025-12-20T10:00:00.000Z" }),
      week("b", 0, { recurrenceRule: "WEEKLY", slotGroupId: "g", createdAt: "2025-12-20T10:00:01.000Z" }),
      week("a1", 7, { parentShiftId: "a" }),
      week("b1", 7, { parentShiftId: "b" }),
    ])
    expect(r.rules).toHaveLength(1)
    expect(r.shifts.map((s) => [s.key, s.rule_key, s.slot_index])).toEqual([["a", "a", 0], ["b", "a", 1], ["a1", "a", 0], ["b1", "a", 1]])
  })

  it("uses the venue's timezone and flags a shift that slipped across daylight saving", () => {
    const parent = shift({ id: "p", recurrenceRule: "WEEKLY", scheduledStart: "2026-03-07T02:00:00.000Z", scheduledEnd: "2026-03-07T05:00:00.000Z" })
    const child = shift({ id: "c1", parentShiftId: "p", scheduledStart: "2026-03-14T02:00:00.000Z", scheduledEnd: "2026-03-14T05:00:00.000Z" })
    const r = run([parent, child], [], ctx({ venueTimezones: new Map([["v1", "America/Edmonton"]]) }))
    expect(r.rules[0]).toMatchObject({ timezone: "America/Edmonton", weekday: 4, start_minute_of_day: 1140, anchor_date: "2026-03-06" })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0].message).toContain("1 of 2")
    expect(r.shifts.map((s) => s.scheduled_start)).toEqual(["2026-03-07T02:00:00.000Z", "2026-03-14T02:00:00.000Z"])
  })

  it("skips a series with a recurrence it does not know, and does not emit its root", () => {
    const r = run([week("p", 0, { recurrenceRule: "DAILY" }), week("c1", 7, { parentShiftId: "p" })])
    expect(r.rules).toEqual([])
    expect(r.shifts).toEqual([])
    expect(r.skipped.map((s) => s.key).sort()).toEqual(["c1", "p"])
  })

  it("skips a child whose parent is missing", () => {
    const r = run([week("c1", 7, { parentShiftId: "gone" })])
    expect(r.shifts).toEqual([])
    expect(r.skipped).toEqual([{ key: "c1", reason: "parent shift not found" }])
  })

  it("keeps only one of two shifts on the same slot of one series", () => {
    const r = run([week("p", 0, { recurrenceRule: "WEEKLY" }), week("c1", 0, { parentShiftId: "p" })])
    expect(r.shifts).toHaveLength(1)
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].reason).toBe("same series, start and slot as an earlier shift")
  })
})
