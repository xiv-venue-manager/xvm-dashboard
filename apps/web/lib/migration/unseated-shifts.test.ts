import { describe, expect, it } from "vitest"
import { renderUnseatedShifts, unseatedShifts } from "./unseated-shifts"
import type { ExportedShift } from "./shifts"

const shift = (o: Partial<ExportedShift>): ExportedShift => ({
  id: "s",
  venueId: "v1",
  membershipId: "m1",
  roleId: "r1",
  eventId: null,
  payrollEntryId: null,
  scheduledStart: "2026-11-10T02:00:00Z",
  scheduledEnd: "2026-11-10T04:00:00Z",
  actualStart: null,
  actualEnd: null,
  status: "SCHEDULED",
  notes: null,
  recurrenceRule: null,
  parentShiftId: null,
  slotGroupId: null,
  remindedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...o,
})

const base = {
  roles: [{ id: "r1", name: "Host" }],
  memberships: [{ id: "m1", nickname: null, userId: "u1" }],
  users: [{ id: "u1", displayName: "Ann", name: null }],
  venues: [{ id: "v1", name: "The Venue" }],
  now: new Date("2026-11-07T00:00:00Z"),
}

describe("unseatedShifts", () => {
  it("lists only skipped, future, unworked, live shifts, grouped by series", () => {
    const shifts = [
      shift({ id: "p", recurrenceRule: "FREQ=WEEKLY", status: "COMPLETED", actualStart: "2026-11-03T02:00:00Z" }),
      shift({ id: "a", parentShiftId: "p" }),
      shift({
        id: "b",
        parentShiftId: "p",
        scheduledStart: "2026-11-17T02:00:00Z",
        scheduledEnd: "2026-11-17T04:00:00Z",
      }),
      shift({ id: "past", parentShiftId: "p", scheduledStart: "2026-11-01T02:00:00Z" }),
      shift({ id: "cancelled", parentShiftId: "p", status: "CANCELLED" }),
      shift({ id: "open", membershipId: null, status: "OPEN" }),
      shift({ id: "loaded", parentShiftId: "p" }),
    ]
    const out = unseatedShifts({ ...base, shifts, skippedShiftKeys: new Set(["a", "b", "past", "cancelled", "open"]) })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ venue: "The Venue", shiftCount: 2 })
    expect(out[0].series).toHaveLength(1)
    expect(out[0].series[0]).toMatchObject({ member: "Ann", role: "Host", recurrenceRule: "FREQ=WEEKLY" })
    expect(renderUnseatedShifts(out)).toContain("2 shifts, 1 venues")
  })
})
