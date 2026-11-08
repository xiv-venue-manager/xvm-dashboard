import { describe, it, expect } from "vitest"
import {
  mapFroggeStaffing,
  suggestVenueMatches,
  type BaseFiles,
  type FroggeContext,
  type FroggeExport,
} from "./frogge-staffing"

const NOW = "2026-11-10T18:00:00.000Z"

const base = (): BaseFiles => ({
  people: {
    people: [
      {
        key: "p-owner",
        kind: "user",
        display_name: "Owner",
        is_platform_admin: false,
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        key: "p-two",
        kind: "user",
        display_name: "Two",
        is_platform_admin: false,
        created_at: "2025-01-01T00:00:00.000Z",
      },
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
      {
        key: "m-owner",
        venue_key: "v-ours",
        person_key: "p-owner",
        tier: "owner",
        employment_period: { started_at: "2025-01-01T00:00:00.000Z", ended_at: null },
      },
      {
        key: "m-two",
        venue_key: "v-ours",
        person_key: "p-two",
        tier: "staff",
        employment_period: { started_at: "2026-02-01T00:00:00.000Z", ended_at: null },
      },
    ],
    membershipPositions: [],
  },
  events: {
    events: [{ key: "e-ours", venue_key: "v-ours", starts_at: "2026-11-07T01:00:00.000Z", cancelled_at: null }],
  },
  shifts: { event_positions: [], event_shifts: [], shifts: [] },
  finance: { transactions: [] },
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
    {
      id: 1,
      guild_id: "g1",
      staff_member_id: 1,
      started_at: "2026-01-24T00:00:00.000Z",
      ended_at: null,
      ended_reason: null,
    },
    {
      id: 2,
      guild_id: "g2",
      staff_member_id: 2,
      started_at: "2026-03-01T00:00:00.000Z",
      ended_at: null,
      ended_reason: null,
    },
  ],
  positions: [
    { id: 1, guild_id: "g1", name: "bartender", color: 5, role_id: "999", hourly_rate_gil: 1500 },
    { id: 2, guild_id: "g2", name: "DJ", color: 255, role_id: null, hourly_rate_gil: null },
  ],
  staff_member_positions: [{ id: 1, guild_id: "g2", staff_member_id: 2, position_id: 2 }],
  events: [
    {
      id: 1,
      guild_id: "g1",
      name: "Same night",
      description: null,
      start_at: "2026-11-07T02:30:00.000Z",
      end_at: "2026-11-07T05:00:00.000Z",
      image_url: null,
      address: null,
    },
    {
      id: 2,
      guild_id: "g2",
      name: "New night",
      description: " Come by ",
      start_at: "2026-11-14T20:00:00.000Z",
      end_at: null,
      image_url: " https://img/new.png ",
      address: " 1  Goblet ",
    },
  ],
  event_positions: [
    { id: 1, guild_id: "g1", event_id: 1, position_id: 1 },
    { id: 2, guild_id: "g2", event_id: 2, position_id: 2 },
  ],
  event_shifts: [
    {
      id: 1,
      guild_id: "g2",
      event_position_id: 2,
      capacity: 2,
      start_at: "2026-11-14T20:00:00.000Z",
      end_at: "2026-11-14T23:00:00.000Z",
    },
  ],
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
    expect(created).toMatchObject({
      name: "New Place!",
      slug: "new-place",
      timezone: "America/New_York",
      data_center: "Aether",
      world: "Adamantoise",
      is_active: true,
    })
    expect(venues.filter((v) => String(v.key).startsWith("frogge:v:"))).toHaveLength(2)
  })

  it("keeps a missing timezone as UTC and lists the venue for the owner to check", () => {
    const result = run()
    expect(
      (result.files.venues.venues as Record<string, unknown>[]).find((v) => v.key === "frogge:v:g3")?.timezone
    ).toBe("UTC")
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
    const slugs = (
      run(src, ctx({ venueMatch: { g1: "v-ours", g2: null, g3: null, g4: null } })).files.venues.venues as Record<
        string,
        unknown
      >[]
    ).map((v) => v.slug)
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
    expect(result.report.startDateAmendments).toEqual([
      { membership_key: "m-two", from: "2026-02-01T00:00:00.000Z", to: "2026-01-24T00:00:00.000Z" },
    ])
  })

  it("makes an admin who is not Frogge staff a manager", () => {
    const src = source()
    src.admin_users.push({ guild_id: "g2", discord_user_id: "450" })
    const result = run(src)
    const tiers = Object.fromEntries(memberships(result).map((m) => [m.person_key, m.tier]))
    expect(tiers["frogge:p:450"]).toBe("manager")
    expect(result.report.placeholderPeople).toContain("450")
  })

  it("leaves an admin whose server is not being loaded to the report, and never changes our tier", () => {
    const src = source()
    src.admin_users.push({ guild_id: "g9", discord_user_id: "100" }, { guild_id: "g1", discord_user_id: "200" })
    const result = run(src)
    expect(result.report.dropped).toContainEqual({
      what: "admin user",
      id: "g9:100",
      reason: "its server is not being loaded",
    })
    expect(memberships(result).find((m) => m.key === "m-two")?.tier).toBe("staff")
  })

  it("keeps the start of the current period and reports a closed one that ended before ours began", () => {
    const src = source()
    src.employment_periods.push({
      id: 9,
      guild_id: "g1",
      staff_member_id: 1,
      started_at: "2025-01-01T00:00:00.000Z",
      ended_at: "2025-03-01T00:00:00.000Z",
      ended_reason: "quit",
    })
    const result = run(src)
    expect(memberships(result).find((m) => m.key === "m-two")?.employment_period).toEqual({
      started_at: "2026-01-24T00:00:00.000Z",
      ended_at: null,
    })
    expect(result.report.dropped).toContainEqual({
      what: "employment period",
      id: "9",
      reason: "it ended before ours began; the loader takes one period per membership",
    })
  })

  it("loads a new member's open period whatever order the periods are listed in, and reports the others", () => {
    const src = source()
    src.employment_periods.push({
      id: 8,
      guild_id: "g2",
      staff_member_id: 2,
      started_at: "2025-01-01T00:00:00.000Z",
      ended_at: "2025-03-01T00:00:00.000Z",
      ended_reason: null,
    })
    const result = run(src)
    expect(memberships(result).find((m) => m.person_key === "frogge:p:300")?.employment_period).toEqual({
      started_at: "2026-03-01T00:00:00.000Z",
      ended_at: null,
    })
    expect(result.report.dropped.filter((d) => d.what === "employment period")).toEqual([
      {
        what: "employment period",
        id: "8",
        reason: "it is not the current one; the loader takes one period per membership",
      },
    ])
  })

  it("names an owner who is not Frogge staff with a placeholder and reports it", () => {
    const result = run()
    expect(result.files.people.people.find((p) => p.key === "frogge:p:500")?.display_name).toBe("Discord user 500")
    expect(result.report.placeholderPeople).toEqual(["500", "600"])
  })
})

describe("mapFroggeStaffing positions", () => {
  it("keeps our Discord role when the position already has one", () => {
    const files = base()
    ;(files.positions.positions[0] as Record<string, unknown>).discord_role_id = "111"
    const result = run(source(), ctx(), files)
    expect((result.files.positions.positions[0] as Record<string, unknown>).discord_role_id).toBe("111")
  })

  it("matches a position by name, keeps ours, and fills the rate and role only where ours is empty", () => {
    const result = run()
    const positions = result.files.positions.positions as Record<string, unknown>[]
    expect(positions.filter((p) => p.venue_key === "v-ours")).toHaveLength(1)
    expect(positions.find((p) => p.key === "pos-ours")).toMatchObject({
      hourly_rate_minor: 1500,
      discord_role_id: "999",
    })
  })

  it("creates a new position with the Frogge role and rate converted", () => {
    const positions = run().files.positions.positions as Record<string, unknown>[]
    expect(positions.find((p) => p.key === "frogge:pos:2")).toMatchObject({
      venue_key: "frogge:v:g2",
      name: "DJ",
      color: 255,
      hourly_rate_minor: null,
      discord_role_id: null,
    })
  })

  it("links a staff member to a position once", () => {
    expect(run().files.positions.membershipPositions).toEqual([
      { membership_key: "frogge:m:2", position_key: "frogge:pos:2" },
    ])
  })
})

describe("mapFroggeStaffing events and shifts", () => {
  it("attaches an event within two hours of one of ours instead of creating a duplicate", () => {
    const result = run()
    const events = result.files.events.events as Record<string, unknown>[]
    expect(events.some((e) => e.key === "frogge:e:1")).toBe(false)
    expect(
      (result.files.shifts.event_positions as Record<string, unknown>[]).find((p) => p.event_key === "e-ours")
    ).toMatchObject({ position_key: "pos-ours" })
  })

  it("does not match one Frogge event to another", () => {
    const src = source()
    src.events.push({
      id: 3,
      guild_id: "g2",
      name: "Late show",
      description: null,
      start_at: "2026-11-14T21:00:00.000Z",
      end_at: null,
      image_url: null,
      address: null,
    })
    const result = run(src)
    const created = (result.files.events.events as Record<string, unknown>[]).filter((e) =>
      String(e.key).startsWith("frogge:e:")
    )
    expect(created.map((e) => e.key)).toEqual(["frogge:e:2", "frogge:e:3"])
    expect(result.report.counts["events matched to ours"]).toBe(1)
  })

  it("creates a new event with a three hour default end, a trimmed location and a publish time", () => {
    const event = (run().files.events.events as Record<string, unknown>[]).find((e) => e.key === "frogge:e:2")
    expect(event).toMatchObject({
      title: "New night",
      location: "1 Goblet",
      image_url: "https://img/new.png",
      description: "Come by",
      ends_at: "2026-11-14T23:00:00.000Z",
      published_at: NOW,
    })
  })

  it("turns a signup into a claimed and approved shift at the load time", () => {
    const shifts = run().files.shifts.shifts as Record<string, unknown>[]
    expect(shifts).toHaveLength(1)
    expect(shifts[0]).toMatchObject({
      key: "frogge:s:1",
      membership_key: "frogge:m:2",
      position_key: "frogge:pos:2",
      claimed_at: NOW,
      approved_at: NOW,
      actual_start: null,
    })
  })

  it("gives a signup to one of our members who is not in Frogge's staff list", () => {
    const src = source()
    src.event_shifts.push({
      id: 2,
      guild_id: "g1",
      event_position_id: 1,
      capacity: 1,
      start_at: "2026-11-07T02:30:00.000Z",
      end_at: null,
    })
    src.event_signups.push({ id: 3, guild_id: "g1", event_shift_id: 2, discord_user_id: "100" })
    const result = run(src)
    const shift = (result.files.shifts.shifts as Record<string, unknown>[]).find((s) => s.key === "frogge:s:3")
    expect(shift?.membership_key).toBe("m-owner")
    expect(result.report.dropped.some((d) => d.what === "signup" && d.id === "3")).toBe(false)
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
    expect(run(src).report.dropped).toContainEqual({
      what: "staff member",
      id: "9",
      reason: "its server is not being loaded",
    })
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

describe("mapFroggeStaffing finance entries and FFXIV Venues links", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 7,
    guild_id: "g2",
    entry_type: "revenue",
    amount: 1500,
    category: "FC Funds",
    memo: "Dues",
    status: "posted",
    recorded_by: "400",
    staff_member_id: null,
    created_at: "2026-11-01T21:14:00.000Z",
    posted_at: "2026-11-01T21:15:00.000Z",
    ...over,
  })

  it("carries a posted revenue entry as other income with its category in the notes", () => {
    const result = run({ ...source(), finance_transactions: [entry()] })
    expect(result.files.finance.transactions).toEqual([
      expect.objectContaining({
        key: "frogge:fin:7",
        venue_key: "frogge:v:g2",
        kind: "other_income",
        amount: 1500,
        status: "posted",
        notes: "FC Funds: Dues",
        posted_at: "2026-11-01T21:15:00.000Z",
        membership_key: null,
        service_key: null,
      }),
    ])
    expect(result.report.counts["finance transactions"]).toBe(1)
  })

  it("keeps a pending entry pending and drops one it cannot place", () => {
    const result = run({
      ...source(),
      finance_transactions: [
        entry({ status: "pending", posted_at: null }),
        entry({ id: 8, amount: 0 }),
        entry({ id: 9, entry_type: "refund" }),
        entry({ id: 10, guild_id: "nowhere" }),
      ],
    })
    expect(result.files.finance.transactions).toEqual([
      expect.objectContaining({ key: "frogge:fin:7", status: "pending", posted_at: null }),
    ])
    expect(result.report.dropped.filter((d) => d.what === "finance transaction").map((d) => d.id)).toEqual([
      "8",
      "9",
      "10",
    ])
  })

  it("links a server's FFXIV Venues listing to its venue once", () => {
    const result = run({
      ...source(),
      venue_links: [
        { guild_id: "g2", ffxivvenues_id: " abc ", last_synced_at: "2026-11-07T17:00:00.000Z" },
        { guild_id: "g3", ffxivvenues_id: "abc", last_synced_at: null },
        { guild_id: "g2", ffxivvenues_id: "second", last_synced_at: null },
        { guild_id: "nowhere", ffxivvenues_id: "x", last_synced_at: null },
      ],
    })
    expect((result.files.venues.externalLinks ?? []).filter((l) => l.provider === "FFXIVVenues")).toEqual([
      {
        venue_key: "frogge:v:g2",
        provider: "FFXIVVenues",
        external_id: "abc",
        linked_at: "2026-11-07T17:00:00.000Z",
        linked_by_person_key: null,
      },
    ])
    expect(result.report.dropped.filter((d) => d.what === "venue link").map((d) => d.reason)).toEqual([
      "that listing is already linked to a venue",
      "the venue already has a different FFXIV Venues listing",
      "its server is not being loaded",
    ])
  })

  it("does not link a listing a matched venue already has", () => {
    const files = base()
    files.venues.externalLinks = [{ venue_key: "v-ours", provider: "FFXIVVenues", external_id: "mine" }]
    const result = run(
      { ...source(), venue_links: [{ guild_id: "g1", ffxivvenues_id: "other", last_synced_at: null }] },
      ctx(),
      files
    )
    expect((result.files.venues.externalLinks ?? []).filter((l) => l.provider === "FFXIVVenues")).toHaveLength(1)
    expect(result.report.dropped.filter((d) => d.what === "venue link")).toHaveLength(1)
  })
})

describe("mapFroggeStaffing Discord server links", () => {
  it("links every loaded server to its venue, by the server owner", () => {
    const links = (run().files.venues.externalLinks ?? []).filter((l) => l.provider === "DiscordGuild")
    expect(links.map((l) => [l.venue_key, l.external_id])).toEqual([
      ["v-ours", "g1"],
      ["frogge:v:g2", "g2"],
      ["frogge:v:g3", "g3"],
    ])
    expect(links.find((l) => l.external_id === "g2")?.linked_by_person_key).toBeTruthy()
  })

  it("does not link a second server to a venue that already has one", () => {
    const files = base()
    files.venues.externalLinks = [{ venue_key: "v-ours", provider: "DiscordGuild", external_id: "other" }]
    const result = run(source(), ctx(), files)
    expect(result.report.dropped.filter((d) => d.what === "discord link").map((d) => d.id)).toEqual(["g1"])
  })
})
