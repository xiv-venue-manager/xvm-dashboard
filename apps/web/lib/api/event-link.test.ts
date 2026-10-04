import { describe, it, expect } from "vitest"
import { eventHref } from "./event-link"

const target = { slug: "test-venue", venueId: "venue-1", canMaterialize: true }
const real = { id: "7", recurrenceRuleId: 3, scheduledAt: "2026-11-01T20:00:00Z" }
const virtual = { id: null, recurrenceRuleId: 3, scheduledAt: "2026-11-01T20:00:00Z" }

describe("eventHref", () => {
  it("opens a real row directly, for anyone", () => {
    expect(eventHref({ ...target, canMaterialize: false }, real)).toBe("/dashboard/test-venue/events/7")
    expect(eventHref(target, real, "edit")).toBe("/dashboard/test-venue/events/7/edit")
  })

  it("sends a computed occurrence through the materialize route", () => {
    expect(eventHref(target, virtual)).toBe(
      "/api/venues/venue-1/events/occurrence?rule=3&at=2026-11-01T20%3A00%3A00Z"
    )
    expect(eventHref(target, virtual, "edit")).toBe(
      "/api/venues/venue-1/events/occurrence?rule=3&at=2026-11-01T20%3A00%3A00Z&to=edit"
    )
  })

  it("gives staff nothing to open, since materialize is Manager tier", () => {
    expect(eventHref({ ...target, canMaterialize: false }, virtual)).toBeNull()
  })

  it("gives nothing for a row with neither an id nor a series slot", () => {
    expect(eventHref(target, { id: null, recurrenceRuleId: null, scheduledAt: null })).toBeNull()
    expect(eventHref(target, { id: null, recurrenceRuleId: 3, scheduledAt: null })).toBeNull()
  })
})
