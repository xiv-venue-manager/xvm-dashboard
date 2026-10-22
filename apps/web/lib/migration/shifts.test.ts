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
  now: new Date("2026-10-09T00:00:00.000Z"),
  ...over,
})

const seat = (over: Partial<ExportedShift> = {}) =>
  shift({ membershipId: "m1", roleId: "r1", eventId: "e1", status: "SCHEDULED", ...over })

const run = (shifts: ExportedShift[], audits: ExportedAudit[] = [], c: ShiftContext = ctx()) =>
  mapShifts({ shifts, audits }, c)

describe("seats", () => {
  it("puts an assigned shift in a seat on an event shift of its own window", () => {
    const r = run([seat()])
    expect(r.event_positions).toEqual([
      { key: "ep-e1-r1", venue_key: "v1", event_key: "e1", position_key: "r1", sort_order: 0 },
    ])
    expect(r.event_shifts).toEqual([
      {
        key: "es-s1",
        venue_key: "v1",
        event_position_key: "ep-e1-r1",
        starts_at: "2026-01-05T19:00:00.000Z",
        ends_at: "2026-01-05T22:00:00.000Z",
        capacity: 1,
        cancelled_at: null,
        cancel_reason: null,
      },
    ])
    expect(r.shifts[0]).toMatchObject({
      key: "s1",
      membership_key: "m1",
      event_shift_key: "es-s1",
      scheduled_start: "2026-01-05T19:00:00.000Z",
      scheduled_end: "2026-01-05T22:00:00.000Z",
      position_key: "r1",
      event_key: "e1",
    })
  })

  it("shares one event position per event and position, and one event shift per window", () => {
    const r = run(
      [
        seat({ id: "a" }),
        seat({ id: "b", membershipId: "m2" }),
        seat({ id: "c", scheduledStart: "2026-01-06T19:00:00.000Z", scheduledEnd: "2026-01-06T22:00:00.000Z" }),
      ],
      [],
      ctx({
        memberships: new Map([
          ["m1", "v1"],
          ["m2", "v1"],
        ]),
      })
    )
    expect(r.event_positions).toHaveLength(1)
    expect(r.event_shifts.map((e) => [e.key, e.capacity])).toEqual([
      ["es-a", 2],
      ["es-c", 1],
    ])
    expect(r.shifts.map((x) => [x.key, x.event_shift_key])).toEqual([
      ["a", "es-a"],
      ["b", "es-a"],
      ["c", "es-c"],
    ])
  })

  it("folds an open slot into the capacity of its event shift and drops the row", () => {
    const r = run([seat({ id: "a" }), shift({ id: "o", roleId: "r1", eventId: "e1", status: "OPEN" })])
    expect(r.event_shifts.map((e) => e.capacity)).toEqual([2])
    expect(r.shifts.map((x) => x.key)).toEqual(["a"])
    expect(r.folded_open_slots).toBe(1)
  })

  it("counts a cancelled open slot as folded too", () => {
    const r = run([seat({ id: "a" }), shift({ id: "o", roleId: "r1", eventId: "e1", status: "CANCELLED" })])
    expect(r.folded_open_slots).toBe(1)
    expect(r.event_shifts[0].capacity).toBe(1)
  })

  it("warns when a slot's capacity is over xvm-api's limit", () => {
    const open = Array.from({ length: 100 }, (_, i) => shift({ id: `o${i}`, roleId: "r1", eventId: "e1", status: "OPEN" }))
    const r = run(open)
    expect(r.event_shifts[0].capacity).toBe(100)
    expect(r.warnings.map((w) => w.message)).toEqual([expect.stringContaining("over xvm-api's limit of 99")])
  })

  it("keeps an event shift with only open slots, with no seats", () => {
    const r = run([shift({ id: "o", roleId: "r1", eventId: "e1", status: "OPEN" })])
    expect(r.event_shifts).toHaveLength(1)
    expect(r.event_shifts[0].capacity).toBe(1)
    expect(r.shifts).toEqual([])
  })

  it("cancels an event shift when every row on it was cancelled, and counts none of them", () => {
    const r = run([seat({ status: "CANCELLED" })])
    expect(r.event_shifts[0]).toMatchObject({ capacity: 1, cancelled_at: "2025-12-21T10:00:00.000Z" })
    expect(r.shifts[0].cancelled_at).toBe("2025-12-21T10:00:00.000Z")
  })

  it("keeps one seat for someone who held two on a shift, and cancels the unstarted one", () => {
    const r = run([seat({ id: "a" }), seat({ id: "b" })])
    expect(r.shifts.map((x) => [x.key, x.event_shift_key, x.cancelled_at, x.cancel_reason])).toEqual([
      ["a", "es-a", null, null],
      ["b", "es-a", "2025-12-21T10:00:00.000Z", "Converted: the same person held another seat on this shift."],
    ])
    expect(r.event_shifts[0].capacity).toBe(1)
    expect(r.audits).toEqual([
      {
        shift_key: "b",
        action: "cancel",
        actor_person_key: null,
        source: "system",
        note: "Converted: the same person held another seat on this shift.",
        created_at: "2025-12-21T10:00:00.000Z",
      },
    ])
  })

  it("seats a second worked row of the same person on an event shift of its own", () => {
    const done = {
      status: "COMPLETED",
      actualStart: "2026-01-05T19:00:00.000Z",
      actualEnd: "2026-01-05T21:00:00.000Z",
    } as const
    const r = run([seat({ id: "a", ...done }), seat({ id: "b", ...done })])
    expect(r.event_shifts.map((e) => [e.key, e.capacity])).toEqual([
      ["es-a", 1],
      ["es-b", 1],
    ])
    expect(r.shifts.map((x) => [x.key, x.event_shift_key, x.cancelled_at])).toEqual([
      ["a", "es-a", null],
      ["b", "es-b", null],
    ])
  })

  it("puts a worked shift with no event or position back as a walk-in", () => {
    const r = run([
      shift({
        membershipId: "m1",
        status: "COMPLETED",
        actualStart: "2026-01-05T19:05:00.000Z",
        actualEnd: "2026-01-05T21:50:00.000Z",
        payrollEntryId: "pay1",
      }),
    ])
    expect(r.event_shifts).toEqual([])
    expect(r.shifts[0]).toMatchObject({
      event_shift_key: null,
      scheduled_start: null,
      scheduled_end: null,
      actual_start: "2026-01-05T19:05:00.000Z",
      payroll_entry_key: "pay1",
    })
  })

  it("skips an unworked shift with no event or position, and an open slot with none", () => {
    const r = run([shift({ id: "a", membershipId: "m1", status: "SCHEDULED" }), shift({ id: "b" })])
    expect(r.shifts).toEqual([])
    expect(r.skipped).toEqual([
      { key: "a", reason: "not worked, and no event or position to seat it on" },
      { key: "b", reason: "open slot with no event or position" },
    ])
  })

  it("leaves an unloaded position or event empty with a warning each, and treats the row as having none", () => {
    const r = run([
      shift({
        membershipId: "m1",
        roleId: "gone",
        eventId: "gone",
        status: "COMPLETED",
        actualStart: "2026-01-05T19:05:00.000Z",
        actualEnd: "2026-01-05T21:50:00.000Z",
      }),
    ])
    expect(r.shifts[0]).toMatchObject({ position_key: null, event_key: null, event_shift_key: null })
    expect(r.warnings).toHaveLength(2)
  })

  it("skips a shift whose membership was not loaded or belongs to another venue", () => {
    const r = run([seat({ id: "a", membershipId: "gone" }), seat({ id: "b", venueId: "v2" })])
    expect(r.shifts).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(["membership was not loaded", "membership was not loaded"])
  })

  it("ignores recurrence: every shift of a series is a seat of its own", () => {
    const r = run([
      seat({
        id: "p",
        recurrenceRule: "WEEKLY",
        scheduledStart: "2026-01-05T19:00:00.000Z",
        scheduledEnd: "2026-01-05T22:00:00.000Z",
      }),
      seat({
        id: "c1",
        parentShiftId: "p",
        scheduledStart: "2026-01-12T19:00:00.000Z",
        scheduledEnd: "2026-01-12T22:00:00.000Z",
      }),
    ])
    expect(r.shifts.map((x) => x.event_shift_key)).toEqual(["es-p", "es-c1"])
  })
})

describe("states", () => {
  it("stamps a scheduled shift claimed and approved at creation when there is no audit trail", () => {
    const r = run([seat()])
    expect(r.shifts[0]).toMatchObject({
      claimed_at: "2025-12-20T10:00:00.000Z",
      approved_at: "2025-12-20T10:00:00.000Z",
    })
  })

  it("takes the claim and approval times, and the approver, from the audit log", () => {
    const r = run(
      [seat()],
      [
        audit({ id: "c", action: "CLAIM", createdAt: "2025-12-22T10:00:00.000Z" }),
        audit({ id: "p", action: "APPROVE", actorUserId: "u2", createdAt: "2025-12-23T10:00:00.000Z" }),
      ]
    )
    expect(r.shifts[0]).toMatchObject({
      claimed_at: "2025-12-22T10:00:00.000Z",
      approved_at: "2025-12-23T10:00:00.000Z",
      approved_by_person_key: "u2",
    })
  })

  it("leaves a claimed shift waiting for approval", () => {
    const r = run([seat({ status: "CLAIMED" })])
    expect(r.shifts[0].claimed_at).not.toBeNull()
    expect(r.shifts[0].approved_at).toBeNull()
  })

  it("keeps the actual times of a completed shift", () => {
    const r = run([
      seat({ status: "COMPLETED", actualStart: "2026-01-05T19:05:00.000Z", actualEnd: "2026-01-05T21:50:00.000Z" }),
    ])
    expect(r.shifts[0]).toMatchObject({
      actual_start: "2026-01-05T19:05:00.000Z",
      actual_end: "2026-01-05T21:50:00.000Z",
    })
  })

  it("ends a shift still clocked in at its scheduled end, with a clock-out entry", () => {
    const r = run([seat({ status: "ACTIVE", actualStart: "2026-01-05T19:05:00.000Z" })])
    expect(r.shifts[0].actual_end).toBe("2026-01-05T22:00:00.000Z")
    expect(r.audits).toEqual([
      {
        shift_key: "s1",
        action: "clock_out",
        actor_person_key: null,
        source: "system",
        note: "closed at its scheduled end during migration",
        created_at: "2026-01-05T22:00:00.000Z",
      },
    ])
    expect(r.warnings[0].message).toContain("ended at its scheduled end")
  })

  it("does not close a shift clocked in at or after its scheduled end, which would end before it began", () => {
    const r = run([seat({ status: "ACTIVE", actualStart: "2026-01-05T22:30:00.000Z" })])
    expect(r.shifts[0].actual_end).toBeNull()
    expect(r.warnings[0].message).toContain("at or after its scheduled end")
    expect(r.audits).toEqual([])
  })

  it("warns when one person is still clocked in on more than one shift", () => {
    const live = { status: "ACTIVE", scheduledStart: "2026-10-09T19:00:00.000Z", scheduledEnd: "2026-10-09T22:00:00.000Z", actualStart: "2026-10-09T19:05:00.000Z" } as const
    const r = run([seat({ id: "a", ...live }), seat({ id: "b", eventId: null, ...live })])
    expect(r.warnings.filter((w) => w.key === "m1")).toEqual([
      { key: "m1", message: expect.stringContaining("one open clock per person") },
    ])
  })

  it("leaves a clocked-in shift that has not finished open, and says it needs a manual call", () => {
    const r = run([
      seat({
        status: "ACTIVE",
        actualStart: "2026-10-09T19:05:00.000Z",
        scheduledStart: "2026-10-09T19:00:00.000Z",
        scheduledEnd: "2026-10-09T22:00:00.000Z",
      }),
    ])
    expect(r.shifts[0].actual_end).toBeNull()
    expect(r.warnings[0].message).toContain("manual call")
    expect(r.audits).toEqual([])
  })

  it("carries the payroll link, reminder and notes", () => {
    const r = run([seat({ payrollEntryId: "pay1", remindedAt: "2026-01-05T18:00:00.000Z", notes: " cover " })])
    expect(r.shifts[0]).toMatchObject({
      payroll_entry_key: "pay1",
      reminder_sent_at: "2026-01-05T18:00:00.000Z",
      notes: "cover",
    })
  })
})

describe("audit entries", () => {
  const mapped = (over: Partial<ExportedAudit>) => run([seat()], [audit(over)]).audits[0]

  it("lower-cases the action and renames the source", () => {
    expect(mapped({ action: "CLOCK_OUT", source: "plugin" })).toMatchObject({ action: "clock_out", source: "plugin" })
    expect(mapped({ action: "CLOCK_IN", source: "web" })).toMatchObject({ action: "clock_in", source: "dashboard" })
    expect(mapped({ action: "APPROVE", source: "admin" })).toMatchObject({ action: "approve", source: "dashboard" })
    expect(mapped({ action: "CLOCK_IN", source: "discord" })).toMatchObject({ source: "bot" })
    expect(mapped({ action: "CLOCK_OUT", source: "xiv-admin" })).toMatchObject({ source: "system", note: null })
  })

  it("keeps the original source of a manual edit in the note", () => {
    expect(mapped({ action: "CLOCK_OUT", source: "manual_backdate" })).toMatchObject({
      source: "system",
      note: "original source: manual_backdate",
    })
  })

  it("turns a series cancellation into a cancel entry with a note", () => {
    expect(mapped({ action: "CANCEL_SERIES" })).toMatchObject({ action: "cancel", note: "cancelled with its series" })
  })

  it("leaves the actor empty when that person was not loaded", () => {
    expect(mapped({ actorUserId: "ghost" }).actor_person_key).toBeNull()
  })

  it("skips an unknown action, and an entry whose shift was not loaded", () => {
    const r = run(
      [seat({ membershipId: "gone" })],
      [audit({ id: "x", shiftId: "s1" }), audit({ id: "y", shiftId: "other" })]
    )
    expect(r.audits).toEqual([])
    const r2 = run([seat()], [audit({ id: "z", action: "TELEPORT" })])
    expect(r2.skipped).toEqual([{ key: "z", reason: 'unknown audit action "TELEPORT"' }])
  })
})
