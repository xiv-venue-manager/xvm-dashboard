import { describe, it, expect } from "vitest"
import { canReceiveEvent, outgoingEvent, type StreamViewer } from "./sale-visibility"
import type { VenueEvent } from "./venue-events"

const sale = (staffId: string | null): VenueEvent => ({
  id: "1",
  type: "sale",
  venueId: "v",
  timestamp: "2026-01-01T00:00:00Z",
  data: { amount: 10, staff: staffId === null ? null : { id: staffId, name: "A" } },
})
const saleWithCustomer = (staffId: string | null): VenueEvent => ({
  id: "1",
  type: "sale",
  venueId: "v",
  timestamp: "2026-01-01T00:00:00Z",
  data: { amount: 10, customerName: "Bob", staff: staffId === null ? null : { id: staffId, name: "A" } },
})
const patron: VenueEvent = { id: "2", type: "patron_enter", venueId: "v", timestamp: "2026-01-01T00:00:00Z", data: {} }
const viewer = (over: Partial<StreamViewer>): StreamViewer => ({
  userId: "u1",
  isManager: false,
  salesVisibility: "all",
  revenueVisibility: "all",
  ...over,
})

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

describe("outgoingEvent", () => {
  it("passes the full event when allowed", () => {
    const event = sale("u1")
    expect(outgoingEvent(viewer({ salesVisibility: "all" }), event)).toBe(event)
  })
  it("strips a blocked sale to amount and own when revenue is visible to all", () => {
    const event = saleWithCustomer("u2")
    const result = outgoingEvent(viewer({ salesVisibility: "none", revenueVisibility: "all" }), event)
    expect(result?.type).toBe("sale_total")
    expect(result?.data).toEqual({ amount: 10, own: false })
    expect(result?.data.customerName).toBeUndefined()
    expect(result?.data.staff).toBeUndefined()
  })
  it("marks own true for the viewer's own sale when revenue is own", () => {
    const result = outgoingEvent(viewer({ salesVisibility: "none", revenueVisibility: "own" }), sale("u1"))
    expect(result).toEqual({ id: "1", type: "sale_total", venueId: "v", timestamp: "2026-01-01T00:00:00Z", data: { amount: 10, own: true } })
  })
  it("returns null for someone else's sale when revenue is own", () => {
    expect(outgoingEvent(viewer({ salesVisibility: "none", revenueVisibility: "own" }), sale("u2"))).toBeNull()
  })
  it("returns null when sales are none and revenue is hidden", () => {
    expect(outgoingEvent(viewer({ salesVisibility: "none", revenueVisibility: "hide" }), sale("u2"))).toBeNull()
  })
  it("passes non-sale events through unchanged", () => {
    expect(outgoingEvent(viewer({ salesVisibility: "none", revenueVisibility: "hide" }), patron)).toBe(patron)
  })
})
