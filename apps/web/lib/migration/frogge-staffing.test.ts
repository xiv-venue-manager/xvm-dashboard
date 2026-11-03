import { describe, it, expect } from "vitest"
import { mapFroggeStaffing, suggestVenueMatches, type BaseFiles, type FroggeContext, type FroggeExport } from "./frogge-staffing"

const NOW = "2026-11-10T18:00:00.000Z"

const base = (): BaseFiles => ({
  people: {
    people: [
      { key: "p-owner", kind: "user", display_name: "Owner", is_platform_admin: false, created_at: "2025-01-01T00:00:00.000Z" },
      { key: "p-two", kind: "user", display_name: "Two", is_platform_admin: false, created_at: "2025-01-01T00:00:00.000Z" },
    ],
    discordAccounts: [
      { person_key: "p-owner", provider: "discord", external_id: "100" },
      { person_key: "p-two", provider: "discord", external_id: "200" },
    ],
  },
  venues: { venues: [{ key: "v-ours", name: "Afterdark Collective", slug: "afterdark" }] },
  positions: {
    positions: [{ key: "pos-ours", venue_key: "v-ours", name: "Bartender", color: 1, hourly_rate_minor: null }],
    memberships: [
      { key: "m-owner", venue_key: "v-ours", person_key: "p-owner", tier: "owner", employment_period: { started_at: "2025-01-01T00:00:00.000Z", ended_at: null } },
      { key: "m-two", venue_key: "v-ours", person_key: "p-two", tier: "staff", employment_period: { started_at: "2026-02-01T00:00:00.000Z", ended_at: null } },
    ],
    membershipPositions: [],
  },
  events: {
    events: [{ key: "e-ours", venue_key: "v-ours", starts_at: "2026-11-07T01:00:00.000Z", cancelled_at: null }],
  },
  shifts: { event_positions: [], event_shifts: [], shifts: [] },
})

const source = (): FroggeExport => ({
  guilds: [
    { guild_id: "g1", name: "Afterdark Collective", timezone: "US/Eastern" },
    { guild_id: "g2", name: "New Place!", timezone: "US/Eastern" },
    { guild_id: "g3", name: "UTC Place", timezone: null },
  ],
  v2_venues: [],
  admin_users: [{ guild_id: "g2", discord_user_id: "400" }],
  staff_members: [
    { id: 1, guild_id: "g1", discord_user_id: "200", name: "Two" },
    { id: 2, guild_id: "g2", discord_user_id: "300", name: "Newbie" },
    { id: 3, guild_id: "g2", discord_user_id: "400", name: "Boss" },
  ],
  employment_periods: [
    { id: 1, guild_id: "g1", staff_member_id: 1, started_at: "2026-01-24T00:00:00.000Z", ended_at: null, ended_reason: null },
    { id: 2, guild_id: "g2", staff_member_id: 2, started_at: "2026-03-01T00:00:00.000Z", ended_at: null, ended_reason: null },
  ],
  positions: [
    { id: 1, guild_id: "g1", name: "bartender", color: 5, role_id: "999", hourly_rate_gil: 1500 },
    { id: 2, guild_id: "g2", name: "DJ", color: 255, role_id: null, hourly_rate_gil: null },
  ],
  staff_member_positions: [{ id: 1, guild_id: "g2", staff_member_id: 2, position_id: 2 }],
  events: [
    { id: 1, guild_id: "g1", name: "Same night", description: null, start_at: "2026-11-07T02:30:00.000Z", end_at: "2026-11-07T05:00:00.000Z", image_url: null, address: null },
    { id: 2, guild_id: "g2", name: "New night", description: " Come by ", start_at: "2026-11-14T20:00:00.000Z", end_at: null, image_url: null, address: " 1  Goblet " },
  ],
  event_positions: [
    { id: 1, guild_id: "g1", event_id: 1, position_id: 1 },
    { id: 2, guild_id: "g2", event_id: 2, position_id: 2 },
  ],
  event_shifts: [{ id: 1, guild_id: "g2", event_position_id: 2, capacity: 2, start_at: "2026-11-14T20:00:00.000Z", end_at: "2026-11-14T23:00:00.000Z" }],
  event_signups: [
    { id: 1, guild_id: "g2", event_shift_id: 1, discord_user_id: "300" },
    { id: 2, guild_id: "g2", event_shift_id: 1, discord_user_id: "777" },
  ],
})

const ctx = (over: Partial<FroggeContext> = {}): FroggeContext => ({
  owners: { g2: "500", g3: "600" },
  venueMatch: { g1: "v-ours", g2: null, g3: null },
  now: NOW,
  ...over,
})

const run = (src = source(), context = ctx(), files = base()) => mapFroggeStaffing(src, context, files)
const memberships = (result: ReturnType<typeof run>) => result.files.positions.memberships as Record<string, unknown>[]

describe("mapFroggeStaffing venues", () => {
  it("creates a venue per unmatched server with the agreed defaults and an IANA timezone", () => {
    const venues = run().files.venues.venues as Record<string, unknown>[]
    const created = venues.find((v) => v.key === "frogge:v:g2")
    expect(created).toMatchObject({ name: "New Place!", slug: "new-place", timezone: "America/New_York", data_center: "Aether", world: "Adamantoise", is_active: true })
    expect(venues.filter((v) => String(v.key).startsWith("frogge:v:"))).toHaveLength(2)
  })

  it("keeps a missing timezone as UTC and lists the venue for the owner to check", () => {
    const result = run()
    expect((result.files.venues.venues as Record<string, unknown>[]).find((v) => v.key === "frogge:v:g3")?.timezone).toBe("UTC")
    expect(result.report.utcVenues).toEqual(["g3"])
  })

  it("does not create a venue for a server matched to one of ours", () => {
    const result = run()
    expect(result.report.matchedVenues).toEqual([{ guild_id: "g1", key: "v-ours" }])
    expect(result.report.newVenues.map((v) => v.guild_id)).toEqual(["g2", "g3"])
  })

  it("makes a unique slug when two names fold to the same one", () => {
    const src = source()
    src.guilds.push({ guild_id: "g4", name: "new place", timezone: null })
    const slugs = (run(src, ctx({ venueMatch: { g1: "v-ours", g2: null, g3: null, g4: null } })).files.venues.venues as Record<string, unknown>[]).map((v) => v.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe("mapFroggeStaffing people and tiers", () => {
  it("gives staff the staff tier, admins manager, and the server owner owner", () => {
    const tiers = Object.fromEntries(memberships(run()).map((m) => [m.person_key, m.tier]))
    expect(tiers["frogge:p:300"]).toBe("staff")
    expect(tiers["frogge:p:400"]).toBe("manager")
    expect(tiers["frogge:p:500"]).toBe("owner")
    expect(tiers["frogge:p:600"]).toBe("owner")
  })

  it("reuses our person when the Discord id is already ours, and never changes our tier", () => {
    const result = run()
    const two = memberships(result).filter((m) => m.person_key === "p-two")
    expect(two).toHaveLength(1)
    expect(two[0].tier).toBe("staff")
    expect(result.files.people.people.some((p) => p.key === "frogge:p:200")).toBe(false)
  })

  it("moves our hire date earlier when Frogge has an earlier one", () => {
    const result = run()
    const ours = memberships(result).find((m) => m.key === "m-two")
    expect(ours?.employment_period).toEqual({ started_at: "2026-01-24T00:00:00.000Z", ended_at: null })
    expect(result.report.startDateAmendments).toEqual([{ membership_key: "m-two", from: "2026-02-01T00:00:00.000Z", to: "2026-01-24T00:00:00.000Z" }])
  })

  it("names an owner who is not Frogge staff with a placeholder and reports it", () => {
    const result = run()
    expect(result.files.people.people.find((p) => p.key === "frogge:p:500")?.display_name).toBe("Discord user 500")
    expect(result.report.placeholderPeople).toEqual(["500", "600"])
  })
})

describe("mapFroggeStaffing positions", () => {
  it("matches a position by name, keeps ours, and fills the rate and role only where ours is empty", () => {
    const result = run()
    const positions = result.files.positions.positions as Record<string, unknown>[]
    expect(positions.filter((p) => p.venue_key === "v-ours")).toHaveLength(1)
    expect(positions.find((p) => p.key === "pos-ours")).toMatchObject({ hourly_rate_minor: 1500, discord_role_id: "999" })
  })

  it("creates a new position with the Frogge role and rate converted", () => {
    const positions = run().files.positions.positions as Record<string, unknown>[]
    expect(positions.find((p) => p.key === "frogge:pos:2")).toMatchObject({ venue_key: "frogge:v:g2", name: "DJ", color: 255, hourly_rate_minor: null, discord_role_id: null })
  })

  it("links a staff member to a position once", () => {
    expect(run().files.positions.membershipPositions).toEqual([{ membership_key: "frogge:m:2", position_key: "frogge:pos:2" }])
  })
})

describe("mapFroggeStaffing events and shifts", () => {
  it("attaches an event within two hours of one of ours instead of creating a duplicate", () => {
    const result = run()
    const events = result.files.events.events as Record<string, unknown>[]
    expect(events.some((e) => e.key === "frogge:e:1")).toBe(false)
    expect((result.files.shifts.event_positions as Record<string, unknown>[]).find((p) => p.event_key === "e-ours")).toMatchObject({ position_key: "pos-ours" })
  })

  it("creates a new event with a three hour default end, a trimmed location and a publish time", () => {
    const event = (run().files.events.events as Record<string, unknown>[]).find((e) => e.key === "frogge:e:2")
    expect(event).toMatchObject({ title: "New night", location: "1 Goblet", description: "Come by", ends_at: "2026-11-14T23:00:00.000Z", published_at: NOW })
  })

  it("turns a signup into a claimed and approved shift at the load time", () => {
    const shifts = run().files.shifts.shifts as Record<string, unknown>[]
    expect(shifts).toHaveLength(1)
    expect(shifts[0]).toMatchObject({ key: "frogge:s:1", membership_key: "frogge:m:2", position_key: "frogge:pos:2", claimed_at: NOW, approved_at: NOW, actual_start: null })
  })

  it("drops a signup from someone with no membership at the venue and says why", () => {
    const dropped = run().report.dropped
    expect(dropped).toContainEqual({ what: "signup", id: "2", reason: "the person has no membership at this venue" })
  })
})

describe("mapFroggeStaffing safety", () => {
  it("does not change the files it was given", () => {
    const given = base()
    const before = JSON.stringify(given)
    run(source(), ctx(), given)
    expect(JSON.stringify(given)).toBe(before)
  })

  it("drops staff of a server that is not being loaded", () => {
    const src = source()
    src.staff_members.push({ id: 9, guild_id: "gX", discord_user_id: "900", name: "Stray" })
    expect(run(src).report.dropped).toContainEqual({ what: "staff member", id: "9", reason: "its server is not being loaded" })
  })
})

describe("suggestVenueMatches", () => {
  const venues = [
    { key: "a", name: "Afterdark Collective" },
    { key: "b", name: "Broken Chain" },
    { key: "c", name: "Broken  chain!" },
  ]
  const guilds = [
    { guild_id: "1", name: "afterdark  COLLECTIVE", timezone: null },
    { guild_id: "2", name: "Broken Chain", timezone: null },
    { guild_id: "3", name: "Nowhere", timezone: null },
  ]

  it("matches a name once, ignoring case, spacing and punctuation", () => {
    expect(suggestVenueMatches(guilds, venues)["1"]).toBe("a")
  })

  it("matches nothing when two of our venues fit, or none does", () => {
    const suggestions = suggestVenueMatches(guilds, venues)
    expect(suggestions["2"]).toBeNull()
    expect(suggestions["3"]).toBeNull()
  })
})
