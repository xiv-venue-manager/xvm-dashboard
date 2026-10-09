import { describe, it, expect } from "vitest"
import { proposeVenueTimezones, type VenueTimezoneInput } from "./venue-timezones"

const venue = (over: Partial<VenueTimezoneInput> = {}): VenueTimezoneInput => ({
  id: "v1",
  name: "The Test Lounge",
  slug: "test-lounge",
  dataCenter: "Aether",
  world: "Adamantoise",
  isActive: true,
  timezones: [],
  ...over,
})

const run = (venues: VenueTimezoneInput[]) => proposeVenueTimezones(venues)

describe("proposeVenueTimezones", () => {
  it("uses the only timezone a venue's events use", () => {
    const r = run([venue({ timezones: [{ timezone: "America/Edmonton", count: 12 }] })])
    expect(r.venues[0]).toMatchObject({ timezone: "America/Edmonton", confidence: "one_zone", share: 1, suspect: false })
  })

  it("uses the most common timezone of a mixed venue and records the share", () => {
    const r = run([venue({ timezones: [{ timezone: "America/Chicago", count: 3 }, { timezone: "America/New_York", count: 9 }] })])
    expect(r.venues[0]).toMatchObject({ timezone: "America/New_York", confidence: "mixed", share: 0.75, suspect: false })
    expect(r.venues[0].counts.map((c) => c.timezone)).toEqual(["America/New_York", "America/Chicago"])
  })

  it("breaks a tie by timezone name so the answer is stable", () => {
    const r = run([venue({ timezones: [{ timezone: "Europe/London", count: 5 }, { timezone: "Europe/Berlin", count: 5 }] })])
    expect(r.venues[0].timezone).toBe("Europe/Berlin")
  })

  it("falls back to UTC with no confidence for a venue with no events", () => {
    const r = run([venue({ timezones: [] }), venue({ id: "v2", name: "B", timezones: [{ timezone: "Asia/Tokyo", count: 0 }] })])
    expect(r.venues.map((v) => [v.timezone, v.confidence, v.share])).toEqual([["UTC", "none", null], ["UTC", "none", null]])
  })

  it("flags a venue whose events are mostly UTC as suspect, because that may only mean it was never set", () => {
    const r = run([venue({ timezones: [{ timezone: "UTC", count: 20 }, { timezone: "America/Toronto", count: 2 }] })])
    expect(r.venues[0]).toMatchObject({ timezone: "UTC", confidence: "mixed", suspect: true })
    expect(r.venues[0].note).toContain("never set")
  })

  it("flags a venue that is entirely UTC as suspect too", () => {
    expect(run([venue({ timezones: [{ timezone: "UTC", count: 8 }] })]).venues[0]).toMatchObject({ confidence: "one_zone", suspect: true })
  })

  it("does not trust a value that is not a timezone", () => {
    const r = run([venue({ timezones: [{ timezone: "Mars/Olympus", count: 4 }] })])
    expect(r.venues[0]).toMatchObject({ timezone: "UTC", confidence: "none" })
    expect(r.venues[0].note).toContain("not a timezone")
  })

  it("summarises the venues by confidence and counts the suspect ones", () => {
    const r = run([
      venue({ id: "a", name: "A", timezones: [{ timezone: "America/Edmonton", count: 4 }] }),
      venue({ id: "b", name: "B", timezones: [{ timezone: "UTC", count: 4 }, { timezone: "Europe/London", count: 1 }] }),
      venue({ id: "c", name: "C" }),
      venue({ id: "d", name: "D" }),
    ])
    expect(r.summary).toEqual({ total: 4, oneZone: 1, mixed: 1, none: 2, suspect: 1 })
  })

  it("carries the venue details a person needs to recognise it", () => {
    expect(run([venue({ isActive: false })]).venues[0]).toMatchObject({ venue_key: "v1", name: "The Test Lounge", slug: "test-lounge", data_center: "Aether", world: "Adamantoise", is_active: false })
  })
})
