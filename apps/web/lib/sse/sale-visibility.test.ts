import { describe, it, expect } from "vitest"
import { canReceiveEvent, type StreamViewer } from "./sale-visibility"
import type { VenueEvent } from "./venue-events"

const sale = (staffId: string | null): VenueEvent => ({
  id: "1",
  type: "sale",
  venueId: "v",
  timestamp: "2026-01-01T00:00:00Z",
  data: { amount: 10, staff: staffId === null ? null : { id: staffId, name: "A" } },
})
const patron: VenueEvent = { id: "2", type: "patron_enter", venueId: "v", timestamp: "2026-01-01T00:00:00Z", data: {} }
const viewer = (over: Partial<StreamViewer>): StreamViewer => ({ userId: "u1", isManager: false, salesVisibility: "all", ...over })

describe("canReceiveEvent", () => {
  it("passes non-sale events to everyone", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "none" }), patron)).toBe(true)
  })
  it("passes every sale to managers regardless of setting", () => {
    expect(canReceiveEvent(viewer({ isManager: true, salesVisibility: "none" }), sale("u2"))).toBe(true)
  })
  it("passes every sale to staff when sales are visible to all", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "all" }), sale("u2"))).toBe(true)
  })
  it("blocks every sale for staff when sales are hidden", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "none" }), sale("u1"))).toBe(false)
  })
  it("passes only the viewer's own sales under own", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale("u1"))).toBe(true)
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale("u2"))).toBe(false)
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale(null))).toBe(false)
  })
})
