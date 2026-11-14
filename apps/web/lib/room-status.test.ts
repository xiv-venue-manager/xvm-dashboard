import { describe, expect, it } from "vitest"
import { canRelease, canReserve, roomStatusBadge } from "./room-status"

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
