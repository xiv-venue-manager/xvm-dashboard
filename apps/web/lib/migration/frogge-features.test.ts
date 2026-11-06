import { describe, it, expect } from "vitest"
import { mapFroggeFeatures, type FroggeFeatureExport, type PeopleFile } from "./frogge-features"

const NOW = "2026-11-04T00:00:00.000Z"
const G = "1111111111111111111"
const ctx = { venueKeyByGuild: { [G]: "venue-a" }, now: NOW }
const base = (): PeopleFile => ({ people: [], discordAccounts: [] })
const empty = (): FroggeFeatureExport => ({
  guild_configurations: [],
  reaction_role_panels: [],
  reaction_role_options: [],
  leveling_settings: [],
  leveling_members: [],
  leveling_role_rewards: [],
  vip_tiers: [],
  vip_perks: [],
  vip_memberships: [],
  vip_members: [],
})
const run = (over: Partial<FroggeFeatureExport>, people = base()) => mapFroggeFeatures({ ...empty(), ...over }, ctx, people)

const panel = { id: 1, guild_id: G, title: "Pronouns", description: null, thumbnail_url: null, color: 5, message_type: "unique" }

describe("reaction roles", () => {
  it("keeps a panel and numbers its options in id order", () => {
    const r = run({
      reaction_role_panels: [panel],
      reaction_role_options: [
        { id: 9, guild_id: G, panel_id: 1, role_id: "222", label: "b", emoji: null },
        { id: 3, guild_id: G, panel_id: 1, role_id: "111", label: "a", emoji: "x" },
      ],
    })
    expect(r.features.reactionRolePanels).toEqual([
      { key: "frogge:rr:1", venue_key: "venue-a", title: "Pronouns", description: null, color: 5, message_type: "unique", thumbnail_source: null },
    ])
    expect(r.features.reactionRoleOptions.map((o) => [o.role_id, o.sort_order])).toEqual([
      ["111", 0],
      ["222", 1],
    ])
    expect(r.features.reactionRoleOptions[0].panel_key).toBe("frogge:rr:1")
  })

  it("hands a panel's thumbnail URL to the image copy step", () => {
    const r = run({ reaction_role_panels: [{ ...panel, thumbnail_url: " https://bucket/reaction-roles/p.png " }, { ...panel, id: 2 }] })
    expect(r.features.reactionRolePanels.map((p) => p.thumbnail_source)).toEqual(["https://bucket/reaction-roles/p.png", null])
    expect(r.report.counts["panel images to copy"]).toBe(1)
  })

  it("drops a panel of a server that is not a venue, and its options", () => {
    const r = run({
      reaction_role_panels: [{ ...panel, guild_id: "999" }],
      reaction_role_options: [{ id: 1, guild_id: "999", panel_id: 1, role_id: "1", label: null, emoji: null }],
    })
    expect(r.features.reactionRolePanels).toEqual([])
    expect(r.features.reactionRoleOptions).toEqual([])
    expect(r.report.dropped.map((d) => d.what)).toEqual(["reaction role panel", "reaction role option"])
  })
})

describe("leveling", () => {
  const settings = {
    guild_id: G,
    enabled: true,
    xp_min: 15,
    xp_max: 25,
    message_cooldown_seconds: 60,
    voice_xp_per_minute: 5,
    require_other_member_in_voice: true,
    excluded_channel_ids: ["333"],
    excluded_role_ids: [],
    announcement_channel_id: null,
  }

  it("turns the one settings row into a message rule at the midpoint and a voice rule", () => {
    const r = run({ leveling_settings: [settings] })
    expect(r.features.levelingRules).toEqual([
      { venue_key: "venue-a", source_key: "discord.message", xp_amount: 20, cooldown_seconds: 60, enabled: true },
      { venue_key: "venue-a", source_key: "discord.voice", xp_amount: 5, cooldown_seconds: 0, enabled: true },
    ])
    expect(r.features.levelingSettings[0]).toMatchObject({ venue_key: "venue-a", excluded_channel_ids: ["333"], voice_needs_company: true })
    expect(r.report.counts["message XP ranges set to their midpoint"]).toBe(1)
  })

  it("keeps a disabled server's rules disabled", () => {
    expect(run({ leveling_settings: [{ ...settings, enabled: false }] }).features.levelingRules.every((rule) => rule.enabled === false)).toBe(true)
  })

  it("links a member to the existing person, or makes a placeholder", () => {
    const people: PeopleFile = {
      people: [],
      discordAccounts: [{ person_key: "p-known", provider: "discord", external_id: "42" }],
    }
    const r = run(
      {
        leveling_members: [
          { guild_id: G, discord_user_id: "42", total_xp: 10 },
          { guild_id: G, discord_user_id: "77", total_xp: 20 },
        ],
      },
      people,
    )
    expect(r.features.levelingMembers.map((m) => m.person_key)).toEqual(["p-known", "frogge:p:77"])
    expect(r.people.people).toEqual([{ key: "frogge:p:77", kind: "user", display_name: "Discord user 77", is_platform_admin: false, created_at: NOW }])
    expect(people.people).toEqual([])
  })

  it("turns a role reward into a named tier", () => {
    expect(run({ leveling_role_rewards: [{ id: 1, guild_id: G, level: 5, role_id: "808" }] }).features.levelingTiers).toEqual([
      { venue_key: "venue-a", name: "Level 5", min_level: 5, discord_role_id: "808" },
    ])
  })
})

describe("vip", () => {
  const tier = { id: 4, guild_id: G, name: "Gold", cost: 1000000, role_id: "909", color: 7 }
  const history = {
    id: 1,
    guild_id: G,
    discord_user_id: "42",
    tier_id: 4,
    tier_name: "Gold",
    started_at: "2026-09-01T00:00:00.000Z",
    ended_at: null,
    ended_reason: null,
    warn_sent: false,
    expire_sent: false,
  }
  const member = { id: 1, guild_id: G, discord_user_id: "42", tier_id: 4, expires_at: "2027-01-01T00:00:00.000Z", name: "Mira", notes: "comp" }

  it("orders tiers and perks and renames one_time to once", () => {
    const r = run({
      vip_tiers: [tier],
      vip_perks: [
        { id: 2, guild_id: G, tier_id: 4, text: "Drink", description: null, repeatability: "one_time" },
        { id: 1, guild_id: G, tier_id: 4, text: "Seat", description: "d", repeatability: "monthly" },
      ],
    })
    expect(r.features.vipTiers[0]).toMatchObject({ key: "frogge:vt:4", name: "Gold", discord_role_id: "909", sort_order: 0 })
    expect(r.features.vipPerks.map((p) => [p.name, p.repeatability, p.sort_order])).toEqual([
      ["Seat", "monthly", 0],
      ["Drink", "once", 1],
    ])
  })

  it("merges the open history row with the current record", () => {
    const r = run({ vip_tiers: [tier], vip_memberships: [history], vip_members: [member] })
    expect(r.features.vipMemberships).toEqual([
      {
        venue_key: "venue-a",
        person_key: "frogge:p:42",
        tier_key: "frogge:vt:4",
        tier_name: "Gold",
        started_at: "2026-09-01T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
        ended_at: null,
        ended_reason: null,
        warn_sent_at: null,
        expire_sent_at: null,
        notes: "comp",
      },
    ])
    expect(r.people.people[0]).toMatchObject({ display_name: "Mira" })
  })

  it("closes an open membership whose expiry has passed", () => {
    const r = run({ vip_tiers: [tier], vip_memberships: [history], vip_members: [{ ...member, expires_at: "2026-10-01T00:00:00.000Z" }] })
    expect(r.features.vipMemberships[0]).toMatchObject({ ended_at: "2026-10-01T00:00:00.000Z", ended_reason: "expired" })
    expect(r.report.counts["open VIP memberships closed at their expiry"]).toBe(1)
  })

  it("keeps an ended row's reason, with removed becoming revoked", () => {
    const r = run({
      vip_tiers: [tier],
      vip_memberships: [{ ...history, ended_at: "2026-09-10T00:00:00.000Z", ended_reason: "removed" }],
    })
    expect(r.features.vipMemberships[0]).toMatchObject({ ended_at: "2026-09-10T00:00:00.000Z", ended_reason: "revoked", expires_at: null })
  })

  it("stamps a sent warning with the load time so it is not sent twice", () => {
    const r = run({ vip_tiers: [tier], vip_memberships: [{ ...history, warn_sent: true }], vip_members: [member] })
    expect(r.features.vipMemberships[0]).toMatchObject({ warn_sent_at: NOW, expire_sent_at: null })
  })

  it("makes a membership for a current member with no history", () => {
    const r = run({ vip_tiers: [tier], vip_members: [member] })
    expect(r.features.vipMemberships[0]).toMatchObject({ started_at: NOW, tier_name: "Gold", ended_at: null })
    expect(r.report.counts["current VIP members with no history row (started at the load)"]).toBe(1)
  })

  it("drops a second open membership for the same person", () => {
    const r = run({
      vip_tiers: [tier],
      vip_memberships: [history, { ...history, id: 2, tier_id: null }],
      vip_members: [member],
    })
    expect(r.features.vipMemberships).toHaveLength(1)
    expect(r.report.dropped.map((d) => d.reason)).toEqual(["a second open membership for the same person at the venue"])
  })

  it("carries the warning days only for servers that have tiers", () => {
    const r = run({
      vip_tiers: [tier],
      guild_configurations: [
        { guild_id: G, vip_warning_threshold_days: 3 },
        { guild_id: "999", vip_warning_threshold_days: 5 },
      ],
    })
    expect(r.features.vipSettings).toEqual([{ venue_key: "venue-a", warning_days: 3 }])
  })
})

describe("guild settings", () => {
  const config = { guild_id: G, vip_warning_threshold_days: 3, event_start_reminder_minutes: 120, greeting_channel_id: "1090332741872132239" }

  it("carries a server's start reminder lead time and greeting channel to the venue", () => {
    const r = run({ guild_configurations: [config] })
    expect(r.features.shiftSettings).toEqual([{ venue_key: "venue-a", start_reminder_minutes: 120 }])
    expect(r.features.discordSettings).toEqual([{ venue_key: "venue-a", greeting_channel_id: "1090332741872132239" }])
    expect(r.report.counts["start reminder lead times"]).toBe(1)
    expect(r.report.counts["greeting channels"]).toBe(1)
  })

  it("writes nothing for a server with neither set", () => {
    const r = run({ guild_configurations: [{ ...config, event_start_reminder_minutes: null, greeting_channel_id: null }] })
    expect(r.features.shiftSettings).toEqual([])
    expect(r.features.discordSettings).toEqual([])
  })

  it("drops a lead time xvm-api would refuse, and ignores a server that is not a venue", () => {
    const r = run({
      guild_configurations: [
        { ...config, event_start_reminder_minutes: 0 },
        { ...config, guild_id: "999" },
        { ...config, guild_id: "888", event_start_reminder_minutes: null, greeting_channel_id: null },
      ],
    })
    expect(r.features.shiftSettings).toEqual([])
    expect(r.report.dropped).toEqual([
      { what: "start reminder lead time", id: G, reason: "0 minutes is outside what xvm-api accepts (1 to 10080)" },
    ])
    expect(r.features.discordSettings).toHaveLength(1)
  })
})
