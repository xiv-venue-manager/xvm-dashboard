import { describe, it, expect } from "vitest"
import { mapFroggeFeatures, type FroggeFeatureExport, type PeopleFile } from "./frogge-features"

const NOW = "2026-11-04T00:00:00.000Z"
const G = "1111111111111111111"
const ctx = { venueKeyByGuild: { [G]: "venue-a" }, now: NOW }
const base = (): PeopleFile => ({ people: [], discordAccounts: [] })
const empty = (): FroggeFeatureExport => ({
  guild_configurations: [],
  audit_log_settings: [],
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
const run = (
  over: Partial<FroggeFeatureExport>,
  people = base(),
  context: typeof ctx & { createdVenues?: ReadonlySet<string> } = ctx
) => mapFroggeFeatures({ ...empty(), ...over }, context, people)

const panel = {
  id: 1,
  guild_id: G,
  title: "Pronouns",
  description: null,
  thumbnail_url: null,
  color: 5,
  message_type: "unique",
}

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
      {
        key: "frogge:rr:1",
        venue_key: "venue-a",
        title: "Pronouns",
        description: null,
        color: 5,
        message_type: "unique",
        thumbnail_source: null,
      },
    ])
    expect(r.features.reactionRoleOptions.map((o) => [o.role_id, o.sort_order])).toEqual([
      ["111", 0],
      ["222", 1],
    ])
    expect(r.features.reactionRoleOptions[0].panel_key).toBe("frogge:rr:1")
  })

  it("hands a panel's thumbnail URL to the image copy step", () => {
    const r = run({
      reaction_role_panels: [
        { ...panel, thumbnail_url: " https://bucket/reaction-roles/p.png " },
        { ...panel, id: 2 },
      ],
    })
    expect(r.features.reactionRolePanels.map((p) => p.thumbnail_source)).toEqual([
      "https://bucket/reaction-roles/p.png",
      null,
    ])
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
    expect(r.features.levelingSettings[0]).toMatchObject({
      venue_key: "venue-a",
      excluded_channel_ids: ["333"],
      voice_needs_company: true,
    })
    expect(r.report.counts["message XP ranges set to their midpoint"]).toBe(1)
  })

  it("keeps a disabled server's rules disabled", () => {
    expect(
      run({ leveling_settings: [{ ...settings, enabled: false }] }).features.levelingRules.every(
        (rule) => rule.enabled === false
      )
    ).toBe(true)
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
      people
    )
    expect(r.features.levelingMembers.map((m) => m.person_key)).toEqual(["p-known", "frogge:p:77"])
    expect(r.people.people).toEqual([
      { key: "frogge:p:77", kind: "user", display_name: "Discord user 77", is_platform_admin: false, created_at: NOW },
    ])
    expect(people.people).toEqual([])
  })

  it("turns a role reward into a named tier", () => {
    expect(
      run({ leveling_role_rewards: [{ id: 1, guild_id: G, level: 5, role_id: "808" }] }).features.levelingTiers
    ).toEqual([{ venue_key: "venue-a", name: "Level 5", min_level: 5, discord_role_id: "808" }])
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
  const member = {
    id: 1,
    guild_id: G,
    discord_user_id: "42",
    tier_id: 4,
    expires_at: "2027-01-01T00:00:00.000Z",
    name: "Mira",
    notes: "comp",
  }

  it("orders tiers and perks and renames one_time to once", () => {
    const r = run({
      vip_tiers: [tier],
      vip_perks: [
        { id: 2, guild_id: G, tier_id: 4, text: "Drink", description: null, repeatability: "one_time" },
        { id: 1, guild_id: G, tier_id: 4, text: "Seat", description: "d", repeatability: "monthly" },
      ],
    })
    expect(r.features.vipTiers[0]).toMatchObject({
      key: "frogge:vt:4",
      name: "Gold",
      discord_role_id: "909",
      sort_order: 0,
    })
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
    const r = run({
      vip_tiers: [tier],
      vip_memberships: [history],
      vip_members: [{ ...member, expires_at: "2026-10-01T00:00:00.000Z" }],
    })
    expect(r.features.vipMemberships[0]).toMatchObject({
      ended_at: "2026-10-01T00:00:00.000Z",
      ended_reason: "expired",
    })
    expect(r.report.counts["open VIP memberships closed at their expiry"]).toBe(1)
  })

  it("keeps an ended row's reason, with removed becoming revoked", () => {
    const r = run({
      vip_tiers: [tier],
      vip_memberships: [{ ...history, ended_at: "2026-09-10T00:00:00.000Z", ended_reason: "removed" }],
    })
    expect(r.features.vipMemberships[0]).toMatchObject({
      ended_at: "2026-09-10T00:00:00.000Z",
      ended_reason: "revoked",
      expires_at: null,
    })
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
  const config = {
    guild_id: G,
    vip_warning_threshold_days: 3,
    event_start_reminder_minutes: 120,
    event_lockout_minutes: 240,
    greeting_channel_id: "1090332741872132239",
    honeypot_channel_id: "1090332741872132240",
  }

  it("carries a server's lead times and channels to the venue, one row each", () => {
    const r = run({ guild_configurations: [config] })
    expect(r.features.shiftSettings).toEqual([
      { venue_key: "venue-a", start_reminder_minutes: 120, lockout_minutes: 240 },
    ])
    expect(r.features.discordSettings).toEqual([
      { venue_key: "venue-a", greeting_channel_id: "1090332741872132239", honeypot_channel_id: "1090332741872132240" },
    ])
    for (const name of ["start reminder lead times", "event lockouts", "greeting channels", "honeypot channels"]) {
      expect(r.report.counts[name]).toBe(1)
    }
  })

  it("writes a row with only what the server has set", () => {
    const r = run({
      guild_configurations: [
        { ...config, event_start_reminder_minutes: null, event_lockout_minutes: 15, greeting_channel_id: null },
      ],
    })
    expect(r.features.shiftSettings).toEqual([
      { venue_key: "venue-a", start_reminder_minutes: null, lockout_minutes: 15 },
    ])
    expect(r.features.discordSettings).toEqual([
      { venue_key: "venue-a", greeting_channel_id: null, honeypot_channel_id: "1090332741872132240" },
    ])
  })

  it("writes nothing for a server with none of them set", () => {
    const none = {
      ...config,
      event_start_reminder_minutes: null,
      event_lockout_minutes: null,
      greeting_channel_id: null,
      honeypot_channel_id: null,
    }
    const r = run({ guild_configurations: [none] })
    expect(r.features.shiftSettings).toEqual([])
    expect(r.features.discordSettings).toEqual([])
  })

  it("turns shift approval off for a venue made from a Frogge server, where joining takes the seat at once", () => {
    const created = { ...ctx, createdVenues: new Set(["venue-a"]) }
    const r = run({ guild_configurations: [config] }, base(), created)
    expect(r.features.shiftSettings).toEqual([
      { venue_key: "venue-a", start_reminder_minutes: 120, lockout_minutes: 240, approval_required: false },
    ])
    expect(r.report.counts["shift approval turned off"]).toBe(1)
  })

  it("writes the approval row even when the server set neither lead time", () => {
    const created = { ...ctx, createdVenues: new Set(["venue-a"]) }
    const none = { ...config, event_start_reminder_minutes: null, event_lockout_minutes: null }
    const r = run({ guild_configurations: [none] }, base(), created)
    expect(r.features.shiftSettings).toEqual([
      { venue_key: "venue-a", start_reminder_minutes: null, lockout_minutes: null, approval_required: false },
    ])
  })

  it("leaves a matched venue's approval alone", () => {
    const r = run({ guild_configurations: [config] })
    expect(r.features.shiftSettings).toEqual([
      { venue_key: "venue-a", start_reminder_minutes: 120, lockout_minutes: 240 },
    ])
    expect(r.features.shiftSettings[0]).not.toHaveProperty("approval_required")
  })

  it("carries the staff role to the venue's Discord settings", () => {
    const r = run({ guild_configurations: [{ ...config, staff_role_id: "555" }] })
    expect(r.features.discordSettings).toEqual([
      {
        venue_key: "venue-a",
        greeting_channel_id: "1090332741872132239",
        honeypot_channel_id: "1090332741872132240",
        staff_role_id: "555",
      },
    ])
    expect(r.report.counts["staff roles"]).toBe(1)
  })

  it("writes a Discord settings row for a staff role alone, and no staff_role_id when there is none", () => {
    const bare = { guild_id: G, vip_warning_threshold_days: 3 }
    const only = run({ guild_configurations: [{ ...bare, staff_role_id: "555" }] })
    expect(only.features.discordSettings).toEqual([
      { venue_key: "venue-a", greeting_channel_id: null, honeypot_channel_id: null, staff_role_id: "555" },
    ])
    expect(run({ guild_configurations: [config] }).features.discordSettings[0]).not.toHaveProperty("staff_role_id")
  })

  it("notes the settings it does not carry, with how many servers use them", () => {
    const r = run({
      guild_configurations: [
        { ...config, profile_approval_required: false, require_staffing_qualification: true },
        { ...config, guild_id: "999", profile_approval_required: false },
      ],
    })
    expect(r.report.notes).toContain(
      "1 server turned off profile approval, which xvm-api's profile settings do not carry yet"
    )
    expect(r.report.notes).toContain("1 server required a staffing qualification, which is not carried")
  })

  it("drops a number of minutes xvm-api would refuse, and ignores a server that is not a venue", () => {
    const r = run({
      guild_configurations: [
        { ...config, event_start_reminder_minutes: 0, event_lockout_minutes: 10081 },
        { ...config, guild_id: "999" },
      ],
    })
    expect(r.features.shiftSettings).toEqual([])
    expect(r.report.dropped).toEqual([
      { what: "start reminder lead time", id: G, reason: "0 minutes is outside what xvm-api accepts (1 to 10080)" },
      { what: "event lockout", id: G, reason: "10081 minutes is outside what xvm-api accepts (1 to 10080)" },
    ])
    expect(r.features.discordSettings).toHaveLength(1)
  })
})

describe("audit log settings", () => {
  const audit = { guild_id: G, channel_id: "1373894502929928203" }

  it("writes the channel, and a row for each event that is on or has a colour", () => {
    const r = run({
      audit_log_settings: [
        {
          ...audit,
          log_message_deleted: true,
          color_message_deleted: 3107663,
          log_member_name_changed: true,
          color_voice_left: 15902298,
        },
      ],
    })
    expect(r.features.auditLogSettings).toEqual([{ venue_key: "venue-a", channel_id: "1373894502929928203" }])
    expect(r.features.auditLogEvents).toEqual([
      { venue_key: "venue-a", event_key: "message.deleted", enabled: true, color: 3107663 },
      { venue_key: "venue-a", event_key: "member.name_changed", enabled: true, color: null },
      { venue_key: "venue-a", event_key: "voice.left", enabled: false, color: 15902298 },
    ])
    expect(r.report.counts["audit log channels"]).toBe(1)
    expect(r.report.counts["audit log events"]).toBe(3)
  })

  it("names every event the way xvm-api does", () => {
    const everything = Object.fromEntries(
      [
        "message_deleted",
        "message_edited",
        "member_joined",
        "member_left",
        "member_name_changed",
        "member_avatar_changed",
        "member_banned",
        "member_unbanned",
        "member_timed_out",
        "member_timeout_removed",
        "channel_created",
        "channel_updated",
        "channel_deleted",
        "role_created",
        "role_updated",
        "role_deleted",
        "server_updated",
        "emoji_updated",
        "voice_joined",
        "voice_moved",
        "voice_left",
      ].map((e) => [`log_${e}`, true])
    )
    const r = run({ audit_log_settings: [{ ...audit, ...everything }] })
    expect(r.features.auditLogEvents.map((e) => e.event_key)).toEqual([
      "message.deleted",
      "message.edited",
      "member.joined",
      "member.left",
      "member.name_changed",
      "member.avatar_changed",
      "member.banned",
      "member.unbanned",
      "member.timed_out",
      "member.timeout_removed",
      "channel.created",
      "channel.updated",
      "channel.deleted",
      "role.created",
      "role.updated",
      "role.deleted",
      "server.updated",
      "emoji.updated",
      "voice.joined",
      "voice.moved",
      "voice.left",
    ])
  })

  it("skips a server with nothing set, keeps events when there is no channel, and ignores a server that is not a venue", () => {
    const r = run({
      audit_log_settings: [
        { guild_id: G, channel_id: null },
        { guild_id: "999", channel_id: "5", log_member_joined: true },
      ],
    })
    expect(r.features.auditLogSettings).toEqual([])
    expect(r.features.auditLogEvents).toEqual([])
    const quiet = run({ audit_log_settings: [{ guild_id: G, channel_id: null, log_member_left: true }] })
    expect(quiet.features.auditLogEvents).toHaveLength(1)
  })
})
