type Row = Record<string, unknown>

export interface FroggeFeatureExport {
  guild_configurations: {
    guild_id: string
    vip_warning_threshold_days: number | null
    event_start_reminder_minutes?: number | null
    greeting_channel_id?: string | null
  }[]
  reaction_role_panels: {
    id: number
    guild_id: string
    title: string | null
    description: string | null
    thumbnail_url: string | null
    color: number | null
    message_type: string
  }[]
  reaction_role_options: { id: number; guild_id: string; panel_id: number; role_id: string; label: string | null; emoji: string | null }[]
  leveling_settings: {
    guild_id: string
    enabled: boolean
    xp_min: number
    xp_max: number
    message_cooldown_seconds: number
    voice_xp_per_minute: number
    require_other_member_in_voice: boolean
    excluded_channel_ids: string[]
    excluded_role_ids: string[]
    announcement_channel_id: string | null
  }[]
  leveling_members: { guild_id: string; discord_user_id: string; total_xp: number }[]
  leveling_role_rewards: { id: number; guild_id: string; level: number; role_id: string }[]
  vip_tiers: { id: number; guild_id: string; name: string; cost: number; role_id: string | null; color: number | null }[]
  vip_perks: { id: number; guild_id: string; tier_id: number; text: string; description: string | null; repeatability: string }[]
  vip_memberships: {
    id: number
    guild_id: string
    discord_user_id: string
    tier_id: number | null
    tier_name: string
    started_at: string
    ended_at: string | null
    ended_reason: string | null
    warn_sent: boolean
    expire_sent: boolean
  }[]
  vip_members: { id: number; guild_id: string; discord_user_id: string; tier_id: number; expires_at: string | null; name: string | null; notes: string | null }[]
}

export interface FeatureContext {
  venueKeyByGuild: Record<string, string>
  now: string
}

export interface PeopleFile {
  people: Row[]
  discordAccounts: Row[]
}

export interface FeatureFile {
  reactionRolePanels: Row[]
  reactionRoleOptions: Row[]
  levelingSettings: Row[]
  levelingRules: Row[]
  levelingMembers: Row[]
  levelingTiers: Row[]
  vipTiers: Row[]
  vipPerks: Row[]
  vipMemberships: Row[]
  vipSettings: Row[]
  shiftSettings: Row[]
  discordSettings: Row[]
}

export interface FeatureReport {
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
  notes: string[]
}

export interface FeatureResult {
  people: PeopleFile
  features: FeatureFile
  report: FeatureReport
}

const MESSAGE_RULE = "discord.message"
const VOICE_RULE = "discord.voice"
const REPEATABILITY: Record<string, string> = { one_time: "once" }
const END_REASON: Record<string, string> = { removed: "revoked" }
const MAX_NAME = 100
const MAX_START_REMINDER_MINUTES = 7 * 24 * 60

const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ")
const ms = (iso: string) => new Date(iso).getTime()

export function mapFroggeFeatures(source: FroggeFeatureExport, ctx: FeatureContext, base: PeopleFile): FeatureResult {
  const people: PeopleFile = structuredClone(base)
  const features: FeatureFile = {
    reactionRolePanels: [],
    reactionRoleOptions: [],
    levelingSettings: [],
    levelingRules: [],
    levelingMembers: [],
    levelingTiers: [],
    vipTiers: [],
    vipPerks: [],
    vipMemberships: [],
    vipSettings: [],
    shiftSettings: [],
    discordSettings: [],
  }
  const report: FeatureReport = { counts: {}, dropped: [], notes: [] }
  const bump = (name: string, by = 1) => (report.counts[name] = (report.counts[name] ?? 0) + by)
  const drop = (what: string, id: string, reason: string) => report.dropped.push({ what, id, reason })

  const personByDiscord = new Map<string, string>()
  for (const account of people.discordAccounts) personByDiscord.set(account.external_id as string, account.person_key as string)
  const personFor = (discordId: string, name: string | null) => {
    const known = personByDiscord.get(discordId)
    if (known) return known
    const key = `frogge:p:${discordId}`
    const display = clean(name).slice(0, MAX_NAME)
    people.people.push({ key, kind: "user", display_name: display || `Discord user ${discordId}`, is_platform_admin: false, created_at: ctx.now })
    people.discordAccounts.push({ person_key: key, provider: "discord", external_id: discordId })
    personByDiscord.set(discordId, key)
    bump("people created")
    return key
  }
  const venueOf = (guildId: string, what: string, id: string) => {
    const key = ctx.venueKeyByGuild[guildId]
    if (!key) drop(what, id, `server ${guildId} is not a migrated venue`)
    return key ?? null
  }
  const inOrder = <T extends { id: number }>(rows: T[]) => [...rows].sort((a, b) => a.id - b.id)

  const panelKey = new Map<number, string>()
  const optionCount = new Map<number, number>()
  for (const panel of inOrder(source.reaction_role_panels)) {
    const venueKey = venueOf(panel.guild_id, "reaction role panel", String(panel.id))
    if (!venueKey) continue
    const key = `frogge:rr:${panel.id}`
    panelKey.set(panel.id, key)
    const thumbnailSource = panel.thumbnail_url?.trim() || null
    if (thumbnailSource) bump("panel images to copy")
    features.reactionRolePanels.push({
      key,
      venue_key: venueKey,
      title: panel.title,
      description: panel.description,
      color: panel.color,
      message_type: panel.message_type,
      thumbnail_source: thumbnailSource,
    })
    bump("reaction role panels")
  }
  for (const option of inOrder(source.reaction_role_options)) {
    const key = panelKey.get(option.panel_id)
    if (!key) {
      drop("reaction role option", String(option.id), "its panel was not migrated")
      continue
    }
    const order = optionCount.get(option.panel_id) ?? 0
    optionCount.set(option.panel_id, order + 1)
    features.reactionRoleOptions.push({ panel_key: key, role_id: option.role_id, label: option.label, emoji: option.emoji, sort_order: order })
    bump("reaction role options")
  }

  for (const settings of source.leveling_settings) {
    const venueKey = venueOf(settings.guild_id, "leveling settings", settings.guild_id)
    if (!venueKey) continue
    features.levelingSettings.push({
      venue_key: venueKey,
      announcement_channel_id: settings.announcement_channel_id,
      excluded_channel_ids: settings.excluded_channel_ids,
      excluded_role_ids: settings.excluded_role_ids,
      voice_needs_company: settings.require_other_member_in_voice,
    })
    if (settings.xp_min !== settings.xp_max) bump("message XP ranges set to their midpoint")
    features.levelingRules.push(
      {
        venue_key: venueKey,
        source_key: MESSAGE_RULE,
        xp_amount: Math.round((settings.xp_min + settings.xp_max) / 2),
        cooldown_seconds: settings.message_cooldown_seconds,
        enabled: settings.enabled,
      },
      { venue_key: venueKey, source_key: VOICE_RULE, xp_amount: settings.voice_xp_per_minute, cooldown_seconds: 0, enabled: settings.enabled },
    )
    bump("leveling settings")
    bump("leveling rules", 2)
  }
  for (const member of source.leveling_members) {
    const venueKey = venueOf(member.guild_id, "leveling member", member.discord_user_id)
    if (!venueKey) continue
    features.levelingMembers.push({ venue_key: venueKey, person_key: personFor(member.discord_user_id, null), total_xp: member.total_xp })
    bump("leveling members")
  }
  for (const reward of inOrder(source.leveling_role_rewards)) {
    const venueKey = venueOf(reward.guild_id, "leveling role reward", String(reward.id))
    if (!venueKey) continue
    features.levelingTiers.push({ venue_key: venueKey, name: `Level ${reward.level}`, min_level: reward.level, discord_role_id: reward.role_id })
    bump("leveling tiers")
  }

  const tierKey = new Map<number, string>()
  const tierName = new Map<number, string>()
  const tierOrder = new Map<string, number>()
  const vipVenues = new Set<string>()
  for (const tier of inOrder(source.vip_tiers)) {
    const venueKey = venueOf(tier.guild_id, "VIP tier", String(tier.id))
    if (!venueKey) continue
    const key = `frogge:vt:${tier.id}`
    const order = tierOrder.get(tier.guild_id) ?? 0
    tierOrder.set(tier.guild_id, order + 1)
    tierKey.set(tier.id, key)
    tierName.set(tier.id, tier.name)
    vipVenues.add(tier.guild_id)
    features.vipTiers.push({ key, venue_key: venueKey, name: tier.name, cost: tier.cost, color: tier.color, discord_role_id: tier.role_id, sort_order: order })
    bump("VIP tiers")
  }
  const perkOrder = new Map<number, number>()
  for (const perk of inOrder(source.vip_perks)) {
    const key = tierKey.get(perk.tier_id)
    if (!key) {
      drop("VIP perk", String(perk.id), "its tier was not migrated")
      continue
    }
    const order = perkOrder.get(perk.tier_id) ?? 0
    perkOrder.set(perk.tier_id, order + 1)
    features.vipPerks.push({
      tier_key: key,
      name: perk.text,
      description: perk.description,
      repeatability: REPEATABILITY[perk.repeatability] ?? perk.repeatability,
      sort_order: order,
    })
    bump("VIP perks")
  }

  const now = ms(ctx.now)
  const opened = new Set<string>()
  const emit = (row: {
    id: string
    guild_id: string
    discord_user_id: string
    tier_id: number | null
    tier_name: string
    started_at: string
    ended_at: string | null
    ended_reason: string | null
    expires_at: string | null
    notes: string | null
    name: string | null
    warned: boolean
    expired: boolean
  }) => {
    const venueKey = venueOf(row.guild_id, "VIP membership", row.id)
    if (!venueKey) return
    let endedAt = row.ended_at
    let reason = row.ended_reason ? (END_REASON[row.ended_reason] ?? row.ended_reason) : null
    if (!endedAt && row.expires_at && ms(row.expires_at) <= now) {
      endedAt = row.expires_at
      reason = "expired"
      bump("open VIP memberships closed at their expiry")
    }
    if (endedAt && ms(endedAt) < ms(row.started_at)) endedAt = row.started_at
    const personKey = personFor(row.discord_user_id, row.name)
    if (!endedAt) {
      const live = `${venueKey}|${personKey}`
      if (opened.has(live)) {
        drop("VIP membership", row.id, "a second open membership for the same person at the venue")
        return
      }
      opened.add(live)
    }
    features.vipMemberships.push({
      venue_key: venueKey,
      person_key: personKey,
      tier_key: row.tier_id === null ? null : (tierKey.get(row.tier_id) ?? null),
      tier_name: row.tier_name,
      started_at: row.started_at,
      expires_at: row.expires_at,
      ended_at: endedAt,
      ended_reason: reason,
      warn_sent_at: row.warned ? ctx.now : null,
      expire_sent_at: row.expired ? ctx.now : null,
      notes: row.notes,
    })
    bump("VIP memberships")
  }

  const currentBySlot = new Map<string, FroggeFeatureExport["vip_members"][number]>(
    source.vip_members.map((m) => [`${m.guild_id}|${m.discord_user_id}`, m]),
  )
  const matched = new Set<string>()
  for (const history of inOrder(source.vip_memberships)) {
    const slot = `${history.guild_id}|${history.discord_user_id}`
    const member = history.ended_at ? undefined : currentBySlot.get(slot)
    if (member) matched.add(slot)
    else if (!history.ended_at) bump("open VIP memberships with no current record (kept without an expiry)")
    emit({
      id: `h${history.id}`,
      guild_id: history.guild_id,
      discord_user_id: history.discord_user_id,
      tier_id: history.tier_id,
      tier_name: history.tier_name,
      started_at: history.started_at,
      ended_at: history.ended_at,
      ended_reason: history.ended_reason,
      expires_at: member?.expires_at ?? null,
      notes: member?.notes ?? null,
      name: member?.name ?? null,
      warned: history.warn_sent,
      expired: history.expire_sent,
    })
  }
  for (const member of inOrder(source.vip_members)) {
    if (matched.has(`${member.guild_id}|${member.discord_user_id}`)) continue
    bump("current VIP members with no history row (started at the load)")
    emit({
      id: `m${member.id}`,
      guild_id: member.guild_id,
      discord_user_id: member.discord_user_id,
      tier_id: member.tier_id,
      tier_name: tierName.get(member.tier_id) ?? "VIP",
      started_at: ctx.now,
      ended_at: null,
      ended_reason: null,
      expires_at: member.expires_at,
      notes: member.notes,
      name: member.name,
      warned: false,
      expired: false,
    })
  }

  for (const config of source.guild_configurations) {
    const venueKey = ctx.venueKeyByGuild[config.guild_id]
    if (!venueKey || !vipVenues.has(config.guild_id)) continue
    features.vipSettings.push({ venue_key: venueKey, warning_days: config.vip_warning_threshold_days })
    bump("VIP settings")
  }

  for (const config of source.guild_configurations) {
    const venueKey = ctx.venueKeyByGuild[config.guild_id]
    if (!venueKey) continue
    const minutes = config.event_start_reminder_minutes ?? null
    if (minutes !== null) {
      if (Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_START_REMINDER_MINUTES) {
        features.shiftSettings.push({ venue_key: venueKey, start_reminder_minutes: minutes })
        bump("start reminder lead times")
      } else {
        drop("start reminder lead time", config.guild_id, `${minutes} minutes is outside what xvm-api accepts (1 to ${MAX_START_REMINDER_MINUTES})`)
      }
    }
    if (config.greeting_channel_id) {
      features.discordSettings.push({ venue_key: venueKey, greeting_channel_id: config.greeting_channel_id })
      bump("greeting channels")
    }
  }

  report.notes.push("reaction role templates are not carried: xvm-api seeds the same platform templates")
  report.notes.push("posted Discord messages are not carried yet")
  return { people, features, report }
}
