import { describe, it, expect } from "vitest"
import { toOpenSlot, toShiftRow } from "./shift-format"
import type { BoardShift, ShiftRow as ApiShiftRow } from "./api/xvm-api"

const board: BoardShift = {
  id: 20,
  event_position_id: 3,
  starts_at: "2026-10-11T19:00:00Z",
  ends_at: "2026-10-11T23:00:00Z",
  capacity: 3,
  cancelled_at: null,
  cancel_reason: null,
  taken: 1,
  pending: 1,
  event_id: 9,
  event_title: "Masquerade",
  position_id: 4,
  position_name: "Bartender",
}

describe("toOpenSlot", () => {
  it("turns a board shift into one open row that counts the seats still free", () => {
    expect(toOpenSlot(board)).toMatchObject({
      id: -20,
      eventShiftId: 20,
      membershipId: null,
      status: "OPEN",
      seatsLeft: 1,
      roleId: 4,
      roleName: "Bartender",
      scheduledStart: "2026-10-11T19:00:00Z",
      scheduledEnd: "2026-10-11T23:00:00Z",
    })
  })

  it("uses an id that cannot collide with a seat's own", () => {
    expect(toOpenSlot(board).id).toBeLessThan(0)
  })
})

describe("toShiftRow", () => {
  it("carries the event shift the seat sits on", () => {
    const seat = {
      id: 41,
      membership_id: 3,
      position_id: 4,
      event_id: 9,
      event_shift_id: 20,
      scheduled_start: "2026-10-11T19:00:00Z",
      scheduled_end: "2026-10-11T23:00:00Z",
      actual_start: null,
      actual_end: null,
      payroll_entry_id: null,
      status: "pending_approval",
      notes: null,
    } as ApiShiftRow
    expect(toShiftRow(seat, "Bartender")).toMatchObject({
      id: 41,
      eventShiftId: 20,
      seatsLeft: null,
      status: "CLAIMED",
    })
  })
})
