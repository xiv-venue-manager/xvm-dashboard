import { describe, it, expect } from "vitest"
import { shiftEventIdField, toShiftEventOptions } from "./shift-event-options"
import type { EventItem } from "@/lib/api/xvm-api"

const item = (over: Partial<EventItem>): EventItem => ({
  materialized: true,
  id: 1,
  recurrence_rule_id: null,
  scheduled_at: null,
  title: "Karaoke",
  description: null,
  event_type: "SOCIAL",
  location: null,
  image_url: null,
  starts_at: "2026-10-03T19:00:00Z",
  ends_at: "2026-10-03T22:00:00Z",
  published_at: "2026-09-01T00:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  ...over,
})

describe("toShiftEventOptions", () => {
  it("maps an event to an option with a string id and its start", () => {
    expect(toShiftEventOptions([item({ id: 7 })])).toEqual([
      { id: "7", name: "Karaoke", startsAt: "2026-10-03T19:00:00Z" },
    ])
  })

  it("drops occurrences that have no row yet, since a shift needs a real event id", () => {
    const virtual = item({ id: null, materialized: false, recurrence_rule_id: 3 })
    expect(toShiftEventOptions([virtual, item({ id: 2 })]).map((o) => o.id)).toEqual(["2"])
  })

  it("orders by start time, oldest first, whatever order the API returned", () => {
    const later = item({ id: 1, starts_at: "2026-10-10T19:00:00Z" })
    const earlier = item({ id: 2, starts_at: "2026-10-01T19:00:00Z" })
    expect(toShiftEventOptions([later, earlier]).map((o) => o.id)).toEqual(["2", "1"])
  })

  it("returns nothing for an empty list", () => {
    expect(toShiftEventOptions([])).toEqual([])
  })
})

describe("shiftEventIdField", () => {
  it("sends the id as a number, which is what the shifts route validates", () => {
    expect(shiftEventIdField("12")).toEqual({ eventId: 12 })
  })

  it("sends nothing when no event is chosen", () => {
    expect(shiftEventIdField("")).toEqual({})
  })
})
