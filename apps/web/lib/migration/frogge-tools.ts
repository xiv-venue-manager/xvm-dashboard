import type { PeopleFile } from "./frogge-features"

type Row = Record<string, unknown>

export interface FroggeToolsExport {
  forms: {
    id: number
    guild_id: string
    name: string
    description: string | null
    pre_prompt: string | null
    post_prompt: string | null
    thumbnail_url: string | null
    color: number | null
    button_label: string
    button_emoji: string | null
    allow_multiple_responses: boolean
    message_id: string | null
  }[]
  form_questions: {
    id: number
    guild_id: string
    form_id: number
    prompt: string
    question_type: string
    required: boolean
    sort_order: number
    options: string[]
  }[]
  form_responses: {
    id: number
    guild_id: string
    form_id: number
    discord_user_id: string
    submitted_at: string | null
    answers: { question_id: number; question: string; question_type: string; answer: string | string[] }[]
  }[]
  giveaways: {
    id: number
    guild_id: string
    created_by: string
    name: string | null
    description: string | null
    prize: string | null
    thumbnail_url: string | null
    color: number | null
    emoji: string | null
    end_at: string | null
    num_winners: number
    auto_notify: boolean
    rolled_at: string | null
    rolled_by: string | null
    winner_ids: string[]
  }[]
  giveaway_entries: { id: number; guild_id: string; giveaway_id: number; discord_user_id: string }[]
  raffles: {
    id: number
    guild_id: string
    created_by: string
    name: string | null
    cost_per_ticket: number
    winner_pct: number
    num_winners: number
    auto_notify: boolean
    rolled_at: string | null
    rolled_by: string | null
    winner_ids: string[]
  }[]
  raffle_entries: { id: number; guild_id: string; raffle_id: number; discord_user_id: string; quantity: number }[]
  sticky_messages: {
    id: number
    guild_id: string
    channel_id: string
    enabled: boolean
    title: string | null
    description: string | null
    color: number | null
    url: string | null
    timestamp: string | null
    header_text: string | null
    header_url: string | null
    footer_text: string | null
    header_icon_url: string | null
    footer_icon_url: string | null
    thumbnail_url: string | null
    image_url: string | null
  }[]
  tracked_streams: {
    id: number
    guild_id: string
    twitch_username: string
    twitch_user_id: string | null
    channel_id: string
    role_id: string | null
    live_since: string | null
    last_event_at: string | null
    resolution_failed_at: string | null
  }[]
  quote_board_settings: {
    guild_id: string
    board_channel_id: string | null
    emoji: string
    reaction_threshold: number
    allow_nsfw_sources: boolean
    blacklisted_channel_ids: string[]
  }[]
  custom_embeds: {
    id: number
    guild_id: string
    name: string
    title: string | null
    description: string | null
    color: number | null
    url: string | null
    timestamp: string | null
    header_text: string | null
    header_icon_url: string | null
    header_url: string | null
    footer_text: string | null
    footer_icon_url: string | null
    thumbnail_url: string | null
    main_image_url: string | null
  }[]
  custom_embed_fields: { id: number; guild_id: string; custom_embed_id: number; name: string; value: string; inline: boolean; sort_order: number }[]
  auto_reactor_rules: { id: number; guild_id: string; channel_id: string | null; keyword: string | null; role_id: string | null; emoji: string }[]
  event_templates: {
    id: number
    guild_id: string
    name: string
    data: { description?: string | null; default_start_time_minutes?: number | null; duration_minutes?: number | null } & Record<string, unknown>
  }[]
  message_templates: { id: number; guild_id: string; template_type: string; title: string | null; description: string | null; is_active: boolean }[]
  profile_characters: ({
    id: number
    guild_id: string
    discord_user_id: string
    character_name: string | null
    is_primary: boolean
    approval_status: string
    submitted_at: string | null
    reviewed_at: string | null
    reviewed_by: string | null
    rejection_reason: string | null
    color: number | null
    thumbnail_url: string | null
    main_image_url: string | null
  } & Partial<Record<ProfileTextField, string | null>>)[]
  rooms: {
    id: number
    guild_id: string
    room_number: number | null
    name: string | null
    description: string | null
    owner_id: string | null
    locked: boolean
    disabled: boolean
  }[]
}

export interface ToolsContext {
  venueKeyByGuild: Record<string, string>
  now: string
}

export interface ToolsFile {
  forms: Row[]
  formQuestions: Row[]
  formResponses: Row[]
  giveaways: Row[]
  giveawayEntries: Row[]
  raffles: Row[]
  raffleEntries: Row[]
  stickyMessages: Row[]
  trackedStreams: Row[]
  quoteBoardSettings: Row[]
  customEmbeds: Row[]
  customEmbedFields: Row[]
  autoReactorRules: Row[]
  eventTemplates: Row[]
  messageTemplates: Row[]
  profiles: Row[]
  rooms: Row[]
}

export interface ToolsReport {
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
  notes: string[]
}

export interface ToolsResult {
  people: PeopleFile
  tools: ToolsFile
  report: ToolsReport
}

const TEMPLATE_TYPES: Record<string, string> = {
  vip_welcome: "vip.welcome",
  vip_warning: "vip.warning",
  vip_expiry: "vip.expiry",
  event_shift_start_reminder: "event.shift_reminder",
  event_channel_start_reminder: "event.channel_reminder",
  channel_greeting: "greeting.channel",
  dm_greeting: "greeting.dm",
  giveaway_winner: "giveaway.winner",
  raffle_winner: "raffle.winner",
}
const GREETING_TYPES = new Set(["greeting.channel", "greeting.dm"])
const venuePlaceholder = (text: string | null, type: string) => (text !== null && GREETING_TYPES.has(type) ? text.replaceAll("{guild}", "{venue}") : text)
const MAX_NAME = 100
const PROFILE_NAME_LENGTH = 60
const PROFILE_TEXT_LIMITS = {
  jobs: 80,
  rates: 250,
  world: 50,
  data_center: 32,
  gender: 32,
  gender_custom: 50,
  pronouns: 200,
  pronouns_custom: 50,
  race: 32,
  race_custom: 50,
  clan: 32,
  clan_custom: 50,
  orientation: 32,
  orientation_custom: 50,
  height: 50,
  age: 30,
  pairing_code: 30,
  pairing_code_type: 32,
  pairing_code_type_custom: 50,
  likes: 500,
  dislikes: 500,
  personality: 300,
  about_me: 3000,
} as const
type ProfileTextField = keyof typeof PROFILE_TEXT_LIMITS

const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ")
const inOrder = <T extends { id: number }>(rows: T[]) => [...rows].sort((a, b) => a.id - b.id)

export function mapFroggeTools(source: FroggeToolsExport, ctx: ToolsContext, base: PeopleFile): ToolsResult {
  const people: PeopleFile = structuredClone(base)
  const tools: ToolsFile = {
    forms: [],
    formQuestions: [],
    formResponses: [],
    giveaways: [],
    giveawayEntries: [],
    raffles: [],
    raffleEntries: [],
    stickyMessages: [],
    trackedStreams: [],
    quoteBoardSettings: [],
    customEmbeds: [],
    customEmbedFields: [],
    autoReactorRules: [],
    eventTemplates: [],
    messageTemplates: [],
    profiles: [],
    rooms: [],
  }
  const report: ToolsReport = { counts: {}, dropped: [], notes: [] }
  const bump = (name: string, by = 1) => (report.counts[name] = (report.counts[name] ?? 0) + by)
  const drop = (what: string, id: string, reason: string) => report.dropped.push({ what, id, reason })

  const personByDiscord = new Map<string, string>()
  for (const account of people.discordAccounts) personByDiscord.set(account.external_id as string, account.person_key as string)
  const personFor = (discordId: string) => {
    const known = personByDiscord.get(discordId)
    if (known) return known
    const key = `frogge:p:${discordId}`
    people.people.push({ key, kind: "user", display_name: `Discord user ${discordId}`, is_platform_admin: false, created_at: ctx.now })
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
  const imagesNotCarried = (what: string, urls: (string | null)[]) => {
    const n = urls.filter(Boolean).length
    if (n) bump(`${what} images not carried`, n)
  }

  const formKey = new Map<number, string>()
  const usedFormNames = new Set<string>()
  for (const form of inOrder(source.forms)) {
    const venueKey = venueOf(form.guild_id, "form", String(form.id))
    if (!venueKey) continue
    let name = clean(form.name).slice(0, MAX_NAME)
    for (let n = 2; usedFormNames.has(`${venueKey}|${name.toLowerCase()}`); n++) {
      name = `${clean(form.name).slice(0, MAX_NAME - String(n).length - 1)} ${n}`
      bump("forms renamed to keep names unique")
    }
    usedFormNames.add(`${venueKey}|${name.toLowerCase()}`)
    const key = `frogge:f:${form.id}`
    formKey.set(form.id, key)
    imagesNotCarried("form", [form.thumbnail_url])
    if (form.message_id) bump("form messages not carried")
    tools.forms.push({
      key,
      venue_key: venueKey,
      name,
      description: form.description,
      pre_prompt: form.pre_prompt,
      post_prompt: form.post_prompt,
      color: form.color,
      button_label: form.button_label,
      button_emoji: form.button_emoji,
      allow_multiple_responses: form.allow_multiple_responses,
    })
    bump("forms")
  }
  const questionKey = new Map<number, string>()
  for (const question of inOrder(source.form_questions)) {
    const parent = formKey.get(question.form_id)
    if (!parent) {
      drop("form question", String(question.id), "its form was not migrated")
      continue
    }
    const key = `frogge:fq:${question.id}`
    questionKey.set(question.id, key)
    tools.formQuestions.push({
      key,
      form_key: parent,
      prompt: question.prompt,
      question_type: question.question_type,
      required: question.required,
      sort_order: question.sort_order,
      options: question.options,
    })
    bump("form questions")
  }
  for (const response of inOrder(source.form_responses)) {
    const parent = formKey.get(response.form_id)
    if (!parent) {
      drop("form response", String(response.id), "its form was not migrated")
      continue
    }
    const missing = response.answers.find((a) => !questionKey.has(a.question_id))
    if (missing) {
      drop("form response", String(response.id), `an answer points at question ${missing.question_id}, which was not migrated`)
      continue
    }
    tools.formResponses.push({
      form_key: parent,
      discord_user_id: response.discord_user_id,
      submitted_at: response.submitted_at,
      answers: response.answers.map((a) => ({ ...a, question_id: questionKey.get(a.question_id) })),
    })
    bump("form responses")
  }

  const winnerRanks = (winnerIds: string[]) => new Map(winnerIds.map((id, i) => [id, i + 1] as const))
  const giveawayKey = new Map<number, string>()
  const giveawayWinners = new Map<number, { ranks: Map<string, number>; at: string }>()
  for (const giveaway of inOrder(source.giveaways)) {
    const venueKey = venueOf(giveaway.guild_id, "giveaway", String(giveaway.id))
    if (!venueKey) continue
    const key = `frogge:g:${giveaway.id}`
    giveawayKey.set(giveaway.id, key)
    giveawayWinners.set(giveaway.id, { ranks: winnerRanks(giveaway.winner_ids), at: giveaway.rolled_at ?? ctx.now })
    imagesNotCarried("giveaway", [giveaway.thumbnail_url])
    tools.giveaways.push({
      key,
      venue_key: venueKey,
      created_by_person_key: personFor(giveaway.created_by),
      name: giveaway.name,
      description: giveaway.description,
      prize: giveaway.prize,
      color: giveaway.color,
      emoji: giveaway.emoji,
      end_at: giveaway.end_at,
      num_winners: giveaway.num_winners,
      auto_notify: giveaway.auto_notify,
      rolled_at: giveaway.rolled_at,
      rolled_by_person_key: giveaway.rolled_by ? personFor(giveaway.rolled_by) : null,
    })
    bump("giveaways")
    if (giveaway.rolled_at === null && giveaway.end_at !== null && Date.parse(giveaway.end_at) < Date.parse(ctx.now)) {
      report.notes.push(`giveaway ${giveaway.id} ended ${giveaway.end_at} and was never rolled, so xvm-api draws it on its first tick and posts the winners`)
    }
  }
  const entered = new Map<number, Set<string>>()
  for (const entry of inOrder(source.giveaway_entries)) {
    const parent = giveawayKey.get(entry.giveaway_id)
    if (!parent) {
      drop("giveaway entry", String(entry.id), "its giveaway was not migrated")
      continue
    }
    const winners = giveawayWinners.get(entry.giveaway_id)
    const rank = winners?.ranks.get(entry.discord_user_id)
    entered.set(entry.giveaway_id, (entered.get(entry.giveaway_id) ?? new Set()).add(entry.discord_user_id))
    tools.giveawayEntries.push({
      giveaway_key: parent,
      discord_user_id: entry.discord_user_id,
      entered_at: ctx.now,
      won_at: rank ? winners?.at : null,
      winner_rank: rank ?? null,
    })
    bump("giveaway entries")
  }
  for (const [id, winners] of giveawayWinners) {
    for (const user of winners.ranks.keys()) if (!entered.get(id)?.has(user)) drop("giveaway winner", `${id}:${user}`, "the winner has no entry row")
  }

  const raffleKey = new Map<number, string>()
  const raffleWinners = new Map<number, { ranks: Map<string, number>; at: string }>()
  const raffleEntered = new Map<number, Set<string>>()
  for (const raffle of inOrder(source.raffles)) {
    const venueKey = venueOf(raffle.guild_id, "raffle", String(raffle.id))
    if (!venueKey) continue
    const key = `frogge:r:${raffle.id}`
    raffleKey.set(raffle.id, key)
    raffleWinners.set(raffle.id, { ranks: winnerRanks(raffle.winner_ids), at: raffle.rolled_at ?? ctx.now })
    tools.raffles.push({
      key,
      venue_key: venueKey,
      created_by_person_key: personFor(raffle.created_by),
      name: raffle.name,
      cost_per_ticket: raffle.cost_per_ticket,
      winner_basis_points: raffle.winner_pct * 100,
      num_winners: raffle.num_winners,
      auto_notify: raffle.auto_notify,
      rolled_at: raffle.rolled_at,
      rolled_by_person_key: raffle.rolled_by ? personFor(raffle.rolled_by) : null,
    })
    bump("raffles")
  }
  for (const entry of inOrder(source.raffle_entries)) {
    const parent = raffleKey.get(entry.raffle_id)
    if (!parent) {
      drop("raffle entry", String(entry.id), "its raffle was not migrated")
      continue
    }
    const winners = raffleWinners.get(entry.raffle_id)
    const rank = winners?.ranks.get(entry.discord_user_id)
    raffleEntered.set(entry.raffle_id, (raffleEntered.get(entry.raffle_id) ?? new Set()).add(entry.discord_user_id))
    tools.raffleEntries.push({
      raffle_key: parent,
      discord_user_id: entry.discord_user_id,
      quantity: entry.quantity,
      entered_at: ctx.now,
      won_at: rank ? winners?.at : null,
      winner_rank: rank ?? null,
    })
    bump("raffle entries")
  }
  for (const [id, winners] of raffleWinners) {
    for (const user of winners.ranks.keys()) if (!raffleEntered.get(id)?.has(user)) drop("raffle winner", `${id}:${user}`, "the winner has no entry row")
  }

  for (const sticky of inOrder(source.sticky_messages)) {
    const venueKey = venueOf(sticky.guild_id, "sticky message", String(sticky.id))
    if (!venueKey) continue
    imagesNotCarried("sticky message", [sticky.header_icon_url, sticky.footer_icon_url, sticky.thumbnail_url, sticky.image_url])
    tools.stickyMessages.push({
      venue_key: venueKey,
      channel_id: sticky.channel_id,
      enabled: sticky.enabled,
      title: sticky.title,
      description: sticky.description,
      color: sticky.color,
      url: sticky.url,
      timestamp_at: sticky.timestamp,
      header_text: sticky.header_text,
      header_url: sticky.header_url,
      footer_text: sticky.footer_text,
    })
    bump("sticky messages")
  }

  for (const stream of inOrder(source.tracked_streams)) {
    const venueKey = venueOf(stream.guild_id, "tracked stream", String(stream.id))
    if (!venueKey) continue
    tools.trackedStreams.push({
      venue_key: venueKey,
      twitch_username: stream.twitch_username,
      twitch_user_id: stream.twitch_user_id,
      channel_id: stream.channel_id,
      role_id: stream.role_id,
      live_since: stream.live_since,
      last_event_at: stream.last_event_at,
      resolution_failed_at: stream.resolution_failed_at,
    })
    bump("tracked streams")
  }

  for (const board of source.quote_board_settings) {
    const venueKey = venueOf(board.guild_id, "quote board", board.guild_id)
    if (!venueKey) continue
    if (!board.board_channel_id && board.blacklisted_channel_ids.length === 0) {
      bump("quote board rows with nothing set, skipped")
      continue
    }
    tools.quoteBoardSettings.push({
      venue_key: venueKey,
      board_channel_id: board.board_channel_id,
      emoji: board.emoji,
      reaction_threshold: board.reaction_threshold,
      allow_nsfw_sources: board.allow_nsfw_sources,
      blacklisted_channel_ids: board.blacklisted_channel_ids,
    })
    bump("quote board settings")
  }

  const embedKey = new Map<number, string>()
  for (const embed of inOrder(source.custom_embeds)) {
    const venueKey = venueOf(embed.guild_id, "custom embed", String(embed.id))
    if (!venueKey) continue
    const key = `frogge:ce:${embed.id}`
    embedKey.set(embed.id, key)
    tools.customEmbeds.push({
      key,
      venue_key: venueKey,
      name: embed.name,
      title: embed.title,
      description: embed.description,
      color: embed.color,
      url: embed.url,
      timestamp_at: embed.timestamp,
      header_text: embed.header_text,
      header_icon_url: embed.header_icon_url,
      header_url: embed.header_url,
      footer_text: embed.footer_text,
      footer_icon_url: embed.footer_icon_url,
      thumbnail_url: embed.thumbnail_url,
      image_url: embed.main_image_url,
    })
    bump("custom embeds")
  }
  for (const field of inOrder(source.custom_embed_fields)) {
    const parent = embedKey.get(field.custom_embed_id)
    if (!parent) {
      drop("custom embed field", String(field.id), "its embed was not migrated")
      continue
    }
    tools.customEmbedFields.push({ custom_embed_key: parent, name: field.name, value: field.value, inline: field.inline, sort_order: field.sort_order })
    bump("custom embed fields")
  }

  for (const rule of inOrder(source.auto_reactor_rules)) {
    const venueKey = venueOf(rule.guild_id, "auto reactor rule", String(rule.id))
    if (!venueKey) continue
    tools.autoReactorRules.push({ venue_key: venueKey, channel_id: rule.channel_id, keyword: rule.keyword, role_id: rule.role_id, emoji: rule.emoji })
    bump("auto reactor rules")
  }

  for (const template of inOrder(source.event_templates)) {
    const venueKey = venueOf(template.guild_id, "event template", String(template.id))
    if (!venueKey) continue
    const data = template.data
    if (Array.isArray(data.positions) && data.positions.length) bump("event template position lists not carried")
    tools.eventTemplates.push({
      venue_key: venueKey,
      name: template.name,
      title: template.name,
      description: data.description ?? null,
      default_start_minute_of_day: data.default_start_time_minutes ?? null,
      default_duration_minutes: data.duration_minutes ?? null,
    })
    bump("event templates")
  }

  for (const template of inOrder(source.message_templates)) {
    const venueKey = venueOf(template.guild_id, "message template", String(template.id))
    if (!venueKey) continue
    const type = TEMPLATE_TYPES[template.template_type]
    if (!type) {
      drop("message template", String(template.id), `no xvm-api template type for ${template.template_type}`)
      continue
    }
    tools.messageTemplates.push({
      venue_key: venueKey,
      template_type: type,
      title: venuePlaceholder(template.title, type),
      description: venuePlaceholder(template.description, type),
      is_active: template.is_active,
    })
    bump("message templates")
  }

  const profileNames = new Set<string>()
  const profilePrimaries = new Set<string>()
  for (const profile of inOrder(source.profile_characters)) {
    const venueKey = venueOf(profile.guild_id, "character profile", String(profile.id))
    if (!venueKey) continue
    const name = clean(profile.character_name).slice(0, PROFILE_NAME_LENGTH)
    if (!name) {
      drop("character profile", String(profile.id), "no character name")
      continue
    }
    const personKey = personFor(profile.discord_user_id)
    const slot = `${venueKey}|${personKey}`
    if (profileNames.has(`${slot}|${name.toLowerCase()}`)) {
      drop("character profile", String(profile.id), "same character name as an earlier profile of this person at the venue, ignoring case")
      continue
    }
    const status = profile.approval_status
    if (status !== "draft" && status !== "pending_approval" && status !== "approved" && status !== "rejected") {
      drop("character profile", String(profile.id), `no xvm-api status for ${status}`)
      continue
    }
    profileNames.add(`${slot}|${name.toLowerCase()}`)
    const submittedAt = status === "draft" ? null : (profile.submitted_at ?? ctx.now)
    const reviewedAt = status === "approved" || status === "rejected" ? (profile.reviewed_at ?? submittedAt) : null
    const isPrimary = profile.is_primary && !profilePrimaries.has(slot)
    if (isPrimary) profilePrimaries.add(slot)
    else if (profile.is_primary) bump("extra primary profiles made ordinary")
    const text: Record<string, string | null> = {}
    for (const [field, limit] of Object.entries(PROFILE_TEXT_LIMITS)) {
      const value = (profile as Record<string, unknown>)[field]
      const trimmed = typeof value === "string" ? value.trim() : ""
      if (trimmed.length > limit) bump("profile fields cut to fit")
      text[field] = trimmed ? trimmed.slice(0, limit) : null
    }
    imagesNotCarried("profile", [profile.thumbnail_url, profile.main_image_url])
    tools.profiles.push({
      venue_key: venueKey,
      person_key: personKey,
      character_name: name,
      is_primary: isPrimary,
      submitted_at: submittedAt,
      reviewed_at: reviewedAt,
      reviewed_by_person_key: reviewedAt && profile.reviewed_by ? personFor(profile.reviewed_by) : null,
      rejection_reason: status === "rejected" ? (clean(profile.rejection_reason).slice(0, 500) || "Rejected on Frogge") : null,
      color: profile.color,
      ...text,
    })
    bump("character profiles")
  }

  for (const room of inOrder(source.rooms)) {
    const venueKey = venueOf(room.guild_id, "room", String(room.id))
    if (!venueKey) continue
    if (room.owner_id) bump("room owners not carried")
    tools.rooms.push({
      venue_key: venueKey,
      name: room.name,
      notes: room.description,
      room_number: room.room_number,
      locked: room.locked,
      disabled: room.disabled,
    })
    bump("rooms")
  }

  report.notes.push("posted Discord messages are not carried yet")
  report.notes.push("room theme, emoji, image, occupant and reservation, and event template details, addresses and images have no xvm-api home")
  return { people, tools, report }
}
