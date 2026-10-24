import { describe, it, expect } from "vitest"
import { tonightEvents } from "./public-events"
import type { PublicEvent } from "@/lib/api/xvm-api"

const now = new Date("2026-10-24T20:00:00Z")
const event = (startsAt: string, title = "Night"): PublicEvent => ({
  title,
  event_type: null,
  starts_at: startsAt,
  ends_at: "2026-10-25T03:00:00Z",
})

describe("tonightEvents", () => {
  it("has nothing for a venue with no events", () => {
    expect(tonightEvents(undefined, now)).toEqual({ live: null, upcoming: null })
  })

  it("passes the live event through", () => {
    const live = event("2026-10-24T19:00:00Z", "Live")
    expect(tonightEvents({ live, upcoming: [] }, now).live).toBe(live)
  })

  it("takes the first upcoming event inside the window, 30 minutes back to 8 hours ahead", () => {
    const events = {
      live: null,
      upcoming: [event("2026-10-24T19:20:00Z", "Too early"), event("2026-10-24T19:30:00Z", "Just in"), event("2026-10-25T04:00:00Z", "Edge")],
    }
    expect(tonightEvents(events, now).upcoming?.title).toBe("Just in")
  })

  it("ignores upcoming events past the window", () => {
    expect(tonightEvents({ live: null, upcoming: [event("2026-10-25T04:00:01Z")] }, now).upcoming).toBeNull()
  })
})
