import { describe, it, expect } from "vitest"
import { mapVenues, type ExportedVenue, type VenuesContext } from "./venues"

const venue = (over: Partial<ExportedVenue> = {}): ExportedVenue => ({
  id: "v1",
  name: "The Test Lounge",
  slug: "test-lounge",
  description: null,
  logoUrl: null,
  bannerUrl: null,
  galleryImages: [],
  dataCenter: "Aether",
  world: "Adamantoise",
  district: "Mist",
  ward: 12,
  plot: 30,
  apartment: null,
  currencyName: "Gil",
  settings: { taskVisibility: "all", salesVisibility: "all", revenueVisibility: "all", eventVisibility: "all" },
  venueType: "LOUNGE",
  partakeTeamId: null,
  ffxivVenueId: null,
  ffxivVenueLinkedAt: null,
  ffxivVenueLinkedBy: null,
  froggeVenueId: null,
  discordServerId: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ownerCount: 1,
  hasContent: true,
  ...over,
})

const ctx = (over: Partial<VenuesContext> = {}): VenuesContext => ({
  personKeys: new Set(["u1"]),
  timezones: new Map([["v1", "America/Toronto"]]),
  skipTestVenues: false,
  ...over,
})

const run = (venues: ExportedVenue[], c: VenuesContext = ctx()) => mapVenues({ venues }, c)

describe("venues", () => {
  it("maps a venue with its location, timezone and visibility", () => {
    expect(run([venue()]).venues[0]).toEqual({
      key: "v1", name: "The Test Lounge", slug: "test-lounge", description: null, logo_url: null, banner_url: null,
      venue_type: "LOUNGE", data_center: "Aether", world: "Adamantoise", district: "Mist", ward: 12, plot: 30, room: null,
      timezone: "America/Toronto", currency_name: "Gil", task_visibility: "all", sales_visibility: "all",
      revenue_visibility: "all", event_visibility: "all", is_active: true,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
    })
  })

  it("maps the old apartment number to xvm-api's room, never its apartment", () => {
    expect(run([venue({ plot: null, apartment: 7 })]).venues[0]).toMatchObject({ plot: null, room: 7 })
  })

  it("gives a venue with no proposed timezone UTC", () => {
    expect(run([venue()], ctx({ timezones: new Map() })).venues[0].timezone).toBe("UTC")
  })

  it("carries the four visibility settings, and sets an unknown or missing one to all, with a count", () => {
    const r = run([venue({ settings: { taskVisibility: "assigned_unassigned", salesVisibility: "own", revenueVisibility: "nonsense" } })])
    expect(r.venues[0]).toMatchObject({ task_visibility: "assigned_unassigned", sales_visibility: "own", revenue_visibility: "all", event_visibility: "all" })
    expect(r.warnings.map((w) => w.message)).toContain("2 visibility settings were missing or unknown, set to all")
  })

  it("skips a venue with no owner and nothing in it, but keeps an ownerless venue that has content, with a warning", () => {
    const r = run([venue({ id: "a", slug: "a", ownerCount: 0, hasContent: false }), venue({ id: "b", slug: "b", ownerCount: 0, hasContent: true })])
    expect(r.venues.map((v) => v.key)).toEqual(["b"])
    expect(r.skipped).toEqual([{ key: "a", reason: "no owner and nothing in it" }])
    expect(r.warnings.map((w) => w.message)).toContain("1 venues have content but no active owner")
  })

  it("includes test venues by default, and leaves them out when told to", () => {
    const test = venue({ venueType: "TEST_VENUE" })
    expect(run([test]).venues).toHaveLength(1)
    const r = run([test], ctx({ skipTestVenues: true }))
    expect(r.venues).toEqual([])
    expect(r.skipped).toEqual([{ key: "v1", reason: "test venue, left out by decision" }])
  })

  it("skips a second venue with the same slug, ignoring case", () => {
    const r = run([venue({ id: "a", slug: "Lounge" }), venue({ id: "b", slug: "lounge", createdAt: "2026-02-01T00:00:00.000Z" })])
    expect(r.venues.map((v) => v.key)).toEqual(["a"])
    expect(r.skipped[0].key).toBe("b")
  })

  it("skips a blank or over-long name", () => {
    const r = run([venue({ id: "a", slug: "a", name: " " }), venue({ id: "b", slug: "b", name: "x".repeat(101) })])
    expect(r.venues).toEqual([])
    expect(r.skipped).toHaveLength(2)
  })

  it("drops a logo over 500 characters with a warning", () => {
    const r = run([venue({ logoUrl: "https://example.test/" + "x".repeat(500) })])
    expect(r.venues[0].logo_url).toBeNull()
    expect(r.warnings[0].message).toContain("logo over 500")
  })
})

describe("links, images and leftovers", () => {
  it("makes external links for Partake and ffxivvenues.com, with the person who linked it", () => {
    const r = run([venue({ partakeTeamId: 412, ffxivVenueId: "ff-9", ffxivVenueLinkedAt: "2026-02-01T00:00:00.000Z", ffxivVenueLinkedBy: "u1" })])
    expect(r.externalLinks).toEqual([
      { venue_key: "v1", provider: "Partake", external_id: "412", linked_at: "2026-01-01T00:00:00.000Z", linked_by_person_key: null },
      { venue_key: "v1", provider: "FFXIVVenues", external_id: "ff-9", linked_at: "2026-02-01T00:00:00.000Z", linked_by_person_key: "u1" },
    ])
  })

  it("does not link the same outside id to two venues", () => {
    const r = run([venue({ id: "a", slug: "a", partakeTeamId: 5 }), venue({ id: "b", slug: "b", partakeTeamId: 5, createdAt: "2026-02-01T00:00:00.000Z" })])
    expect(r.externalLinks.map((l) => l.venue_key)).toEqual(["a"])
    expect(r.warnings.some((w) => w.key === "b" && w.message.includes("already linked"))).toBe(true)
  })

  it("makes ordered gallery images, collapsing repeats and counting dropped ones", () => {
    const r = run([venue({ galleryImages: ["https://example.test/a.png", "https://example.test/a.png", " ", "https://example.test/b.png"] })])
    expect(r.images).toEqual([
      { venue_key: "v1", image_url: "https://example.test/a.png", sort_order: 0 },
      { venue_key: "v1", image_url: "https://example.test/b.png", sort_order: 1 },
    ])
    expect(r.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining(["1 gallery images were blank or over 500 characters, not carried", "1 repeated gallery images were collapsed to one"])
    )
  })

  it("keeps the settings xvm-api has no home for, so nothing is lost", () => {
    const r = run([venue({ settings: { taskVisibility: "all", salesVisibility: "all", revenueVisibility: "all", eventVisibility: "all", tagline: "Come in", tags: ["bar"], openNights: ["fri"], webhooks: {}, discoverySources: [] } })])
    expect(r.leftovers).toEqual([{ venue_key: "v1", settings: { tagline: "Come in", tags: ["bar"], openNights: ["fri"] } }])
  })

  it("does not count a venue whose webhook flags are all off or whose addresses are blank", () => {
    const r = run([venue({ settings: { taskVisibility: "all", salesVisibility: "all", revenueVisibility: "all", eventVisibility: "all", webhooks: { sales: false, events: false }, discordWebhooks: { sales: "", events: " " } } })])
    expect(r.warnings.map((w) => w.message).filter((m) => m.includes("webhook"))).toEqual([])
  })

  it("makes no leftovers entry for a venue with none, and counts Frogge, webhooks and the old Discord id", () => {
    const r = run([venue({ froggeVenueId: "f1", discordServerId: "111", settings: { taskVisibility: "all", salesVisibility: "all", revenueVisibility: "all", eventVisibility: "all", webhooks: { sales: true }, discordWebhooks: { sales: "https://example.test/hook" } } })])
    expect(r.leftovers).toEqual([])
    expect(r.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        "1 venues are connected to Frogge, the connection is not migrated",
        "1 venues have a webhook flag switched on, which is retiring and not migrated",
        "1 venues have Discord webhook addresses, which are retiring and not migrated",
        "1 venues have the deprecated Discord server id, connect them from the dashboard",
      ])
    )
  })
})
