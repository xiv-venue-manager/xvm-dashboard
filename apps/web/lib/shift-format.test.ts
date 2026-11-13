import { describe, it, expect } from "vitest"
import { isClaimableOpenShift, isStaleUnclockedShift, toOpenSlot, toShiftRow } from "./shift-format"
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
    expect(toOpenSlot(board, false)).toMatchObject({
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
    expect(toOpenSlot(board, false).id).toBeLessThan(0)
  })

  it("remembers when the viewer already holds a seat on the shift", () => {
    expect(toOpenSlot(board, true).heldByMe).toBe(true)
    expect(toOpenSlot(board, false).heldByMe).toBe(false)
  })
})

describe("isClaimableOpenShift", () => {
  it("keeps an open shift claimable until its event shift ends", () => {
    expect(isClaimableOpenShift(board, new Date("2026-10-11T18:00:00Z"))).toBe(true)
    expect(isClaimableOpenShift(board, new Date("2026-10-11T22:59:59Z"))).toBe(true)
  })

  it("drops an open shift once its event shift has ended", () => {
    expect(isClaimableOpenShift(board, new Date("2026-10-11T23:00:00Z"))).toBe(false)
    expect(isClaimableOpenShift(board, new Date("2026-10-18T19:00:00Z"))).toBe(false)
  })

  it("drops an open shift whose end time cannot be read", () => {
    expect(isClaimableOpenShift({ ends_at: "not-a-date" }, new Date("2026-10-11T18:00:00Z"))).toBe(false)
  })
})

describe("isStaleUnclockedShift", () => {
  const now = new Date("2026-10-11T23:00:00Z")

  it("drops past seats that were never clocked in", () => {
    expect(isStaleUnclockedShift({ scheduledEnd: "2026-10-11T22:59:59Z", status: "SCHEDULED" }, now)).toBe(true)
    expect(isStaleUnclockedShift({ scheduledEnd: "2026-10-11T22:59:59Z", status: "MISSED" }, now)).toBe(true)
  })

  it("keeps scheduled seats that have not ended and every clocked seat", () => {
    expect(isStaleUnclockedShift({ scheduledEnd: "2026-10-11T23:00:01Z", status: "SCHEDULED" }, now)).toBe(false)
    expect(isStaleUnclockedShift({ scheduledEnd: "2026-10-11T22:59:59Z", status: "ACTIVE" }, now)).toBe(false)
    expect(isStaleUnclockedShift({ scheduledEnd: "2026-10-11T22:59:59Z", status: "COMPLETED" }, now)).toBe(false)
  })

  it("keeps a seat whose end time cannot be read", () => {
    expect(isStaleUnclockedShift({ scheduledEnd: "not-a-date", status: "SCHEDULED" }, now)).toBe(false)
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
