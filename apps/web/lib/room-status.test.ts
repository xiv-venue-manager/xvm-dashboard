import { describe, expect, it } from "vitest"
import { canRelease, canReserve, filterRooms, ROOM_FILTERS, roomStatusBadge } from "./room-status"

const rooms = [
  { id: 1, status: "available" },
  { id: 2, status: "reserved" },
  { id: 3, status: "locked" },
  { id: 4, status: "disabled" },
  { id: 5, status: "available" },
]

describe("filterRooms", () => {
  it("keeps every room, in order, for All", () => {
    expect(filterRooms(rooms, "all")).toEqual(rooms)
  })

  it("keeps only rooms in the chosen status", () => {
    expect(filterRooms(rooms, "available").map((r) => r.id)).toEqual([1, 5])
    expect(filterRooms(rooms, "reserved").map((r) => r.id)).toEqual([2])
    expect(filterRooms(rooms, "locked").map((r) => r.id)).toEqual([3])
    expect(filterRooms(rooms, "disabled").map((r) => r.id)).toEqual([4])
  })

  it("offers a filter for every status plus All, and none for occupied", () => {
    expect(ROOM_FILTERS.map((f) => f.id)).toEqual(["all", "available", "reserved", "locked", "disabled"])
  })
})

describe("room status", () => {
  it("labels every status xvm-api sends", () => {
    expect(roomStatusBadge("available").label).toBe("Available")
    expect(roomStatusBadge("reserved").label).toBe("Reserved")
    expect(roomStatusBadge("locked").label).toBe("Locked")
    expect(roomStatusBadge("disabled").label).toBe("Disabled")
  })

  it("falls back to the raw value for a status it does not know", () => {
    expect(roomStatusBadge("mystery")).toEqual({ label: "mystery", className: "neutral" })
  })

  it("offers Release on a reserved room and nowhere else", () => {
    expect(canRelease("reserved")).toBe(true)
    for (const status of ["available", "locked", "disabled", "occupied"]) {
      expect(canRelease(status)).toBe(false)
    }
  })

  it("offers Reserve on an available room and nowhere else", () => {
    expect(canReserve("available")).toBe(true)
    for (const status of ["reserved", "locked", "disabled"]) {
      expect(canReserve(status)).toBe(false)
    }
  })
})
