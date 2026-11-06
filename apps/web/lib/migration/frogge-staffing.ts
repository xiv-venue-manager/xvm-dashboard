import { gilToMinorUnits } from "../api/position-convert"

export interface FroggeExport {
  guilds: { guild_id: string; name: string; timezone: string | null }[]
  v2_venues: { discord_guild_id: string; xvm_venue_id: string | null; name: string | null; timezone: string | null }[]
  admin_users: { guild_id: string; discord_user_id: string }[]
  staff_members: { id: number; guild_id: string; discord_user_id: string; name: string | null }[]
  employment_periods: {
    id: number
    guild_id: string
    staff_member_id: number
    started_at: string | null
    ended_at: string | null
    ended_reason: string | null
  }[]
  positions: { id: number; guild_id: string; name: string | null; color: number | null; role_id: string | null; hourly_rate_gil: number | null }[]
  staff_member_positions: { id: number; guild_id: string; staff_member_id: number; position_id: number }[]
  events: {
    id: number
    guild_id: string
    name: string | null
    description: string | null
    start_at: string
    end_at: string | null
    image_url: string | null
    address: string | null
  }[]
  event_positions: { id: number; guild_id: string; event_id: number; position_id: number }[]
  event_shifts: { id: number; guild_id: string; event_position_id: number; capacity: number; start_at: string; end_at: string | null }[]
  event_signups: { id: number; guild_id: string; event_shift_id: number; discord_user_id: string }[]
}

export interface FroggeContext {
  owners: Record<string, string>
  venueMatch: Record<string, string | null>
  now: string
}

type Row = Record<string, unknown>
export interface BaseFiles {
  people: { people: Row[]; discordAccounts: Row[] } & Record<string, unknown>
  venues: { venues: Row[] } & Record<string, unknown>
  positions: { positions: Row[]; memberships: Row[]; membershipPositions: Row[] } & Record<string, unknown>
  events: { events: Row[] } & Record<string, unknown>
  shifts: { event_positions: Row[]; event_shifts: Row[]; shifts: Row[] } & Record<string, unknown>
}

export interface FroggeReport {
  newVenues: { guild_id: string; key: string; name: string; slug: string; timezone: string; owner_discord_id: string | null }[]
  matchedVenues: { guild_id: string; key: string }[]
  startDateAmendments: { membership_key: string; from: string; to: string }[]
  placeholderPeople: string[]
  utcVenues: string[]
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
}

export interface FroggeResult {
  files: BaseFiles
  report: FroggeReport
}

const TZ_ALIASES: Record<string, string> = {
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Alaska": "America/Anchorage",
}
const DEFAULT_DATA_CENTER = "Aether"
const DEFAULT_WORLD = "Adamantoise"
const DEFAULT_EVENT_MS = 3 * 60 * 60 * 1000
const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000
const MAX_NAME = 100
const MAX_TITLE = 200
const MAX_LOCATION = 250

const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ")
const fold = (value: string | null | undefined) => clean(value).toLowerCase()
const ms = (iso: string) => new Date(iso).getTime()
const iso = (time: number) => new Date(time).toISOString()
const str = (row: Row, field: string) => row[field] as string
const slugify = (name: string) =>
  clean(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "")

const nameKey = (name: string | null | undefined) => clean(name).toLowerCase().replace(/[^a-z0-9]/g, "")

export function suggestVenueMatches(guilds: FroggeExport["guilds"], venues: { key: string; name: string }[]): Record<string, string | null> {
  const byName = new Map<string, string[]>()
  for (const venue of venues) {
    const key = nameKey(venue.name)
    if (key) byName.set(key, [...(byName.get(key) ?? []), venue.key])
  }
  const suggestions: Record<string, string | null> = {}
  for (const guild of guilds) {
    const hits = byName.get(nameKey(guild.name)) ?? []
    suggestions[guild.guild_id] = hits.length === 1 ? hits[0] : null
  }
  return suggestions
}

export function mapFroggeStaffing(source: FroggeExport, ctx: FroggeContext, base: BaseFiles): FroggeResult {
  const files = structuredClone(base)
  const report: FroggeReport = {
    newVenues: [],
    matchedVenues: [],
    startDateAmendments: [],
    placeholderPeople: [],
    utcVenues: [],
    counts: {},
    dropped: [],
  }
  const drop = (what: string, id: string, reason: string) => report.dropped.push({ what, id, reason })
  const bump = (name: string) => (report.counts[name] = (report.counts[name] ?? 0) + 1)

  const personByDiscord = new Map<string, string>()
  for (const account of files.people.discordAccounts) personByDiscord.set(str(account, "external_id"), str(account, "person_key"))

  const slugs = new Set(files.venues.venues.map((v) => str(v, "slug")))
  const venueKeyByGuild = new Map<string, string>()
  const timezoneByGuild = new Map(source.guilds.map((g) => [g.guild_id, g.timezone] as const))

  for (const guild of source.guilds) {
    const matched = ctx.venueMatch[guild.guild_id] ?? null
    if (matched) {
      venueKeyByGuild.set(guild.guild_id, matched)
      report.matchedVenues.push({ guild_id: guild.guild_id, key: matched })
      continue
    }
    const key = `frogge:v:${guild.guild_id}`
    const stem = slugify(guild.name) || "venue"
    let slug = stem
    for (let n = 2; slugs.has(slug); n++) slug = `${stem.slice(0, 30 - String(n).length - 1)}-${n}`
    slugs.add(slug)
    const raw = clean(timezoneByGuild.get(guild.guild_id)) || "UTC"
    const timezone = TZ_ALIASES[raw] ?? raw
    if (timezone === "UTC") report.utcVenues.push(guild.guild_id)
    files.venues.venues.push({
      key,
      name: clean(guild.name).slice(0, MAX_NAME) || "Venue",
      slug,
      tagline: null,
      description: null,
      logo_url: null,
      banner_url: null,
      tags: [],
      is_adult: false,
      venue_type: "OTHER",
      data_center: DEFAULT_DATA_CENTER,
      world: DEFAULT_WORLD,
      district: null,
      ward: null,
      plot: null,
      room: null,
      timezone,
      currency_name: "Gil",
      task_visibility: "all",
      sales_visibility: "all",
      revenue_visibility: "all",
      event_visibility: "all",
      is_active: true,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    venueKeyByGuild.set(guild.guild_id, key)
    report.newVenues.push({ guild_id: guild.guild_id, key, name: guild.name, slug, timezone, owner_discord_id: ctx.owners[guild.guild_id] ?? null })
    bump("venues created")
  }

  const personFor = (discordId: string, name: string | null) => {
    const known = personByDiscord.get(discordId)
    if (known) return known
    const key = `frogge:p:${discordId}`
    const display = clean(name).slice(0, MAX_NAME)
    if (!display) report.placeholderPeople.push(discordId)
    files.people.people.push({
      key,
      kind: "user",
      display_name: display || `Discord user ${discordId}`,
      is_platform_admin: false,
      created_at: ctx.now,
    })
    files.people.discordAccounts.push({ person_key: key, provider: "discord", external_id: discordId })
    personByDiscord.set(discordId, key)
    bump("people created")
    return key
  }

  const adminKeys = new Set(source.admin_users.map((a) => `${a.guild_id}:${a.discord_user_id}`))
  const membershipByPersonVenue = new Map<string, Row>()
  for (const m of files.positions.memberships) membershipByPersonVenue.set(`${str(m, "venue_key")}|${str(m, "person_key")}`, m)
  const periodByMember = new Map<number, { started_at: string | null; ended_at: string | null }>()
  for (const p of source.employment_periods) periodByMember.set(p.staff_member_id, { started_at: p.started_at, ended_at: p.ended_at })

  const membershipKeyByStaffMember = new Map<number, string>()
  const membershipKeyByGuildDiscord = new Map<string, string>()
  const ensureMembership = (
    guildId: string,
    discordId: string,
    name: string | null,
    tier: string,
    period: { started_at: string | null; ended_at: string | null } | null,
    sourceId: string,
  ) => {
    const venueKey = venueKeyByGuild.get(guildId)
    if (!venueKey) return null
    const personKey = personFor(discordId, name)
    const slot = `${venueKey}|${personKey}`
    const existing = membershipByPersonVenue.get(slot)
    if (existing) {
      const ours = existing.employment_period as { started_at: string; ended_at: string | null } | null
      if (ours && period?.started_at && ms(period.started_at) < ms(ours.started_at)) {
        report.startDateAmendments.push({ membership_key: str(existing, "key"), from: ours.started_at, to: period.started_at })
        ours.started_at = period.started_at
      }
      return str(existing, "key")
    }
    const key = `frogge:m:${sourceId}`
    const row: Row = {
      key,
      venue_key: venueKey,
      person_key: personKey,
      tier,
      nickname: null,
      tip_pooled: null,
      created_at: ctx.now,
      employment_period: { started_at: period?.started_at ?? ctx.now, ended_at: period?.ended_at ?? null },
    }
    files.positions.memberships.push(row)
    membershipByPersonVenue.set(slot, row)
    bump("memberships created")
    return key
  }

  for (const member of source.staff_members) {
    const owner = ctx.owners[member.guild_id] === member.discord_user_id && !ctx.venueMatch[member.guild_id]
    const tier = owner ? "owner" : adminKeys.has(`${member.guild_id}:${member.discord_user_id}`) ? "manager" : "staff"
    const key = ensureMembership(member.guild_id, member.discord_user_id, member.name, tier, periodByMember.get(member.id) ?? null, String(member.id))
    if (!key) {
      drop("staff member", String(member.id), "its server is not being loaded")
      continue
    }
    membershipKeyByStaffMember.set(member.id, key)
    membershipKeyByGuildDiscord.set(`${member.guild_id}:${member.discord_user_id}`, key)
  }

  for (const guild of source.guilds) {
    if (ctx.venueMatch[guild.guild_id]) continue
    const ownerId = ctx.owners[guild.guild_id]
    if (!ownerId) {
      drop("venue owner", guild.guild_id, "no Discord owner was looked up for this server")
      continue
    }
    const key = ensureMembership(guild.guild_id, ownerId, null, "owner", null, `owner:${guild.guild_id}`)
    if (key) membershipKeyByGuildDiscord.set(`${guild.guild_id}:${ownerId}`, key)
  }

  const positionKeyById = new Map<number, string>()
  const existingPositions = new Map<string, Row>()
  for (const p of files.positions.positions) existingPositions.set(`${str(p, "venue_key")}|${fold(str(p, "name"))}`, p)
  for (const position of source.positions) {
    const venueKey = venueKeyByGuild.get(position.guild_id)
    const name = clean(position.name).slice(0, MAX_NAME)
    if (!venueKey || !name) {
      drop("position", String(position.id), venueKey ? "no name" : "its server is not being loaded")
      continue
    }
    const rate = gilToMinorUnits(position.hourly_rate_gil)
    const existing = existingPositions.get(`${venueKey}|${fold(name)}`)
    if (existing) {
      if (existing.hourly_rate_minor == null && rate !== null) existing.hourly_rate_minor = rate
      if (position.role_id) existing.discord_role_id = position.role_id
      positionKeyById.set(position.id, str(existing, "key"))
      continue
    }
    const key = `frogge:pos:${position.id}`
    const row: Row = {
      key,
      venue_key: venueKey,
      name,
      color: position.color ?? null,
      responsibilities: null,
      hourly_rate_minor: rate,
      pot_payout_mode: "standard",
      contractor_shares_pot: false,
      discord_role_id: position.role_id ?? null,
    }
    files.positions.positions.push(row)
    existingPositions.set(`${venueKey}|${fold(name)}`, row)
    positionKeyById.set(position.id, key)
    bump("positions created")
  }

  const linked = new Set(files.positions.membershipPositions.map((l) => `${str(l, "membership_key")}|${str(l, "position_key")}`))
  for (const link of source.staff_member_positions) {
    const membershipKey = membershipKeyByStaffMember.get(link.staff_member_id)
    const positionKey = positionKeyById.get(link.position_id)
    if (!membershipKey || !positionKey) {
      drop("position assignment", String(link.id), "its staff member or position is not being loaded")
      continue
    }
    if (linked.has(`${membershipKey}|${positionKey}`)) continue
    linked.add(`${membershipKey}|${positionKey}`)
    files.positions.membershipPositions.push({ membership_key: membershipKey, position_key: positionKey })
    bump("position assignments created")
  }

  const eventKeyById = new Map<number, { key: string; venueKey: string }>()
  for (const event of source.events) {
    const venueKey = venueKeyByGuild.get(event.guild_id)
    if (!venueKey) {
      drop("event", String(event.id), "its server is not being loaded")
      continue
    }
    const start = ms(event.start_at)
    const twin = files.events.events.find(
      (e) => str(e, "venue_key") === venueKey && !e.cancelled_at && Math.abs(ms(str(e, "starts_at")) - start) <= MATCH_WINDOW_MS,
    )
    if (twin) {
      eventKeyById.set(event.id, { key: str(twin, "key"), venueKey })
      bump("events matched to ours")
      continue
    }
    const end = event.end_at && ms(event.end_at) > start ? ms(event.end_at) : start + DEFAULT_EVENT_MS
    const key = `frogge:e:${event.id}`
    const address = clean(event.address)
    files.events.events.push({
      key,
      venue_key: venueKey,
      rule_key: null,
      scheduled_at: null,
      title: clean(event.name).slice(0, MAX_TITLE) || "Event",
      event_type: "OTHER",
      description: event.description?.trim() || null,
      location: address ? address.slice(0, MAX_LOCATION) : null,
      image_url: event.image_url?.trim() || null,
      starts_at: iso(start),
      ends_at: iso(end),
      published_at: ctx.now,
      cancelled_at: null,
      partake_event_id: null,
      reminder_sent_at: null,
      cancel_notice_sent_at: null,
      created_by_person_key: null,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    eventKeyById.set(event.id, { key, venueKey })
    bump("events created")
  }

  const eventPositionByLegacyId = new Map<number, { key: string; eventKey: string; positionKey: string; venueKey: string }>()
  const existingEventPositions = new Set(files.shifts.event_positions.map((p) => str(p, "key")))
  const sortOrder = new Map<string, number>()
  for (const ep of source.event_positions) {
    const event = eventKeyById.get(ep.event_id)
    const positionKey = positionKeyById.get(ep.position_id)
    if (!event || !positionKey) {
      drop("event position", String(ep.id), "its event or position is not being loaded")
      continue
    }
    const key = `ep-${event.key}-${positionKey}`
    eventPositionByLegacyId.set(ep.id, { key, eventKey: event.key, positionKey, venueKey: event.venueKey })
    if (existingEventPositions.has(key)) continue
    existingEventPositions.add(key)
    const order = sortOrder.get(event.key) ?? 0
    sortOrder.set(event.key, order + 1)
    files.shifts.event_positions.push({ key, venue_key: event.venueKey, event_key: event.key, position_key: positionKey, sort_order: order })
    bump("event positions created")
  }

  const eventShiftByLegacyId = new Map<
    number,
    { key: string; eventKey: string; positionKey: string; venueKey: string; start: string; end: string }
  >()
  for (const shift of source.event_shifts) {
    const ep = eventPositionByLegacyId.get(shift.event_position_id)
    if (!ep) {
      drop("event shift", String(shift.id), "its event position is not being loaded")
      continue
    }
    const start = ms(shift.start_at)
    const end = shift.end_at && ms(shift.end_at) > start ? ms(shift.end_at) : start + DEFAULT_EVENT_MS
    const key = `frogge:es:${shift.id}`
    files.shifts.event_shifts.push({
      key,
      venue_key: ep.venueKey,
      event_position_key: ep.key,
      starts_at: iso(start),
      ends_at: iso(end),
      capacity: shift.capacity,
      cancelled_at: null,
      cancel_reason: null,
    })
    eventShiftByLegacyId.set(shift.id, { key, eventKey: ep.eventKey, positionKey: ep.positionKey, venueKey: ep.venueKey, start: iso(start), end: iso(end) })
    bump("event shifts created")
  }

  for (const signup of source.event_signups) {
    const es = eventShiftByLegacyId.get(signup.event_shift_id)
    if (!es) {
      drop("signup", String(signup.id), "its event shift is not being loaded")
      continue
    }
    const membershipKey = membershipKeyByGuildDiscord.get(`${signup.guild_id}:${signup.discord_user_id}`)
    if (!membershipKey) {
      drop("signup", String(signup.id), "the person has no membership at this venue")
      continue
    }
    files.shifts.shifts.push({
      key: `frogge:s:${signup.id}`,
      venue_key: es.venueKey,
      membership_key: membershipKey,
      position_key: es.positionKey,
      event_key: es.eventKey,
      event_shift_key: es.key,
      scheduled_start: es.start,
      scheduled_end: es.end,
      actual_start: null,
      actual_end: null,
      claimed_at: ctx.now,
      approved_at: ctx.now,
      approved_by_person_key: null,
      cancelled_at: null,
      cancel_reason: null,
      notes: null,
      payroll_entry_key: null,
      reminder_sent_at: null,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    bump("shifts created")
  }

  return { files, report }
}
