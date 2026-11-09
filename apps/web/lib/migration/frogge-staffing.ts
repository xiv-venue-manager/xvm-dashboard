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
  positions: {
    id: number
    guild_id: string
    name: string | null
    color: number | null
    role_id: string | null
    hourly_rate_gil: number | null
  }[]
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
  event_shifts: {
    id: number
    guild_id: string
    event_position_id: number
    capacity: number
    start_at: string
    end_at: string | null
  }[]
  event_signups: { id: number; guild_id: string; event_shift_id: number; discord_user_id: string }[]
  finance_transactions?: {
    id: number
    guild_id: string
    entry_type: string
    amount: number
    category: string | null
    memo: string | null
    status: string
    recorded_by: string | null
    staff_member_id: number | null
    created_at: string
    posted_at: string | null
  }[]
  venue_links?: { guild_id: string; ffxivvenues_id: string; last_synced_at: string | null }[]
}

export interface FroggeContext {
  owners: Record<string, string>
  venueMatch: Record<string, string | null>
  venueSlugs?: Record<string, string>
  now: string
}

type Row = Record<string, unknown>
export interface BaseFiles {
  people: { people: Row[]; discordAccounts: Row[] } & Record<string, unknown>
  venues: { venues: Row[]; externalLinks?: Row[] } & Record<string, unknown>
  finance: { transactions: Row[] } & Record<string, unknown>
  positions: { positions: Row[]; memberships: Row[]; membershipPositions: Row[] } & Record<string, unknown>
  events: { events: Row[] } & Record<string, unknown>
  shifts: { event_positions: Row[]; event_shifts: Row[]; shifts: Row[] } & Record<string, unknown>
}

export type SlugWhy =
  | "cut to 50 characters"
  | "numbered because the slug was taken"
  | "no letters or digits in the name"
  | "characters outside ASCII dropped"
  | "override"

export interface FroggeReport {
  newVenues: {
    guild_id: string
    key: string
    name: string
    slug: string
    timezone: string
    owner_discord_id: string | null
  }[]
  matchedVenues: { guild_id: string; key: string }[]
  slugNotes: { guild_id: string; name: string; slug: string; why: SlugWhy }[]
  startDateAmendments: { membership_key: string; from: string; to: string }[]
  placeholderPeople: string[]
  utcVenues: string[]
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
}

export interface FroggeResult {
  files: BaseFiles
  report: FroggeReport
  venueSlugs: Record<string, string>
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
const MAX_SLUG = 50
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const slugFolded = (name: string) =>
  clean(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
const slugWhole = (name: string) =>
  slugFolded(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
const slugify = (name: string) => slugWhole(name).slice(0, MAX_SLUG).replace(/-+$/g, "")

const nameKey = (name: string | null | undefined) =>
  clean(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

export function suggestVenueMatches(
  guilds: FroggeExport["guilds"],
  venues: { key: string; name: string }[]
): Record<string, string | null> {
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
    slugNotes: [],
    startDateAmendments: [],
    placeholderPeople: [],
    utcVenues: [],
    counts: {},
    dropped: [],
  }
  const drop = (what: string, id: string, reason: string) => report.dropped.push({ what, id, reason })
  const bump = (name: string) => (report.counts[name] = (report.counts[name] ?? 0) + 1)

  const personByDiscord = new Map<string, string>()
  for (const account of files.people.discordAccounts)
    personByDiscord.set(str(account, "external_id"), str(account, "person_key"))

  const slugs = new Set(files.venues.venues.map((v) => str(v, "slug").toLowerCase()))
  const venueSlugs: Record<string, string> = {}
  const overrides = ctx.venueSlugs ?? {}
  const guildIds = new Set(source.guilds.map((g) => g.guild_id))
  const overridden = new Set<string>()
  for (const [guildId, slug] of Object.entries(overrides)) {
    const fail = (why: string): never => {
      throw new Error(`venue slug override for guild ${guildId}: ${why}`)
    }
    if (!guildIds.has(guildId)) fail("the guild is not in the export")
    if (ctx.venueMatch[guildId]) fail("the guild is matched to an existing venue")
    if (!SLUG_PATTERN.test(slug)) fail("the slug must be a-z, 0-9 and single hyphens, not at either end")
    if (slug.length > MAX_SLUG) fail(`the slug is longer than ${MAX_SLUG} characters`)
    if (slugs.has(slug.toLowerCase())) fail("the slug is already taken by an existing venue or another override")
    slugs.add(slug.toLowerCase())
    overridden.add(guildId)
  }
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
    const named = slugify(guild.name)
    const stem = named || `venue-${guild.guild_id.slice(-6)}`
    let slug = overridden.has(guild.guild_id) ? overrides[guild.guild_id] : stem
    if (!overridden.has(guild.guild_id)) {
      for (let n = 2; slugs.has(slug); n++) slug = `${stem.slice(0, MAX_SLUG - String(n).length - 1)}-${n}`
      slugs.add(slug)
    }
    venueSlugs[guild.guild_id] = slug
    const why: SlugWhy | null = overridden.has(guild.guild_id)
      ? "override"
      : slug !== stem
        ? "numbered because the slug was taken"
        : !named
          ? "no letters or digits in the name"
          : slugWhole(guild.name).length > MAX_SLUG
            ? "cut to 50 characters"
            : /[^\x00-\x7f]/.test(slugFolded(guild.name))
              ? "characters outside ASCII dropped"
              : null
    if (why) report.slugNotes.push({ guild_id: guild.guild_id, name: guild.name, slug, why })
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
    report.newVenues.push({
      guild_id: guild.guild_id,
      key,
      name: guild.name,
      slug,
      timezone,
      owner_discord_id: ctx.owners[guild.guild_id] ?? null,
    })
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
  for (const m of files.positions.memberships)
    membershipByPersonVenue.set(`${str(m, "venue_key")}|${str(m, "person_key")}`, m)
  type Period = { id: number; started_at: string | null; ended_at: string | null }
  const periodsByMember = new Map<number, Period[]>()
  for (const p of source.employment_periods) {
    periodsByMember.set(p.staff_member_id, [
      ...(periodsByMember.get(p.staff_member_id) ?? []),
      { id: p.id, started_at: p.started_at, ended_at: p.ended_at },
    ])
  }
  const notCarried = (period: Period, why: string) =>
    drop("employment period", String(period.id), `${why}; the loader takes one period per membership`)
  const latest = (periods: Period[]) => {
    const open = periods.filter((p) => p.ended_at === null)
    const pool = open.length > 0 ? open : periods
    const when = (p: Period) => ms((open.length > 0 ? p.started_at : p.ended_at) ?? "1970-01-01T00:00:00.000Z")
    return pool.reduce<Period | null>((best, p) => (best === null || when(p) > when(best) ? p : best), null)
  }

  const membershipKeyByStaffMember = new Map<number, string>()
  const ensureMembership = (
    guildId: string,
    discordId: string,
    name: string | null,
    tier: string,
    periods: Period[],
    sourceId: string
  ) => {
    const venueKey = venueKeyByGuild.get(guildId)
    if (!venueKey) return null
    const personKey = personFor(discordId, name)
    const slot = `${venueKey}|${personKey}`
    const existing = membershipByPersonVenue.get(slot)
    if (existing) {
      const ours = existing.employment_period as { started_at: string; ended_at: string | null } | null
      if (ours) {
        const oursStart = ms(ours.started_at)
        for (const period of periods) {
          if (period.ended_at !== null && ms(period.ended_at) < oursStart) {
            notCarried(period, "it ended before ours began")
            continue
          }
          if (period.started_at && ms(period.started_at) < ms(ours.started_at)) {
            report.startDateAmendments.push({
              membership_key: str(existing, "key"),
              from: ours.started_at,
              to: period.started_at,
            })
            ours.started_at = period.started_at
          }
        }
      }
      return str(existing, "key")
    }
    const period = latest(periods)
    for (const other of periods) if (other !== period) notCarried(other, "it is not the current one")
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

  const tierFor = (guildId: string, discordId: string, fallback: string) =>
    ctx.owners[guildId] === discordId && !ctx.venueMatch[guildId]
      ? "owner"
      : adminKeys.has(`${guildId}:${discordId}`)
        ? "manager"
        : fallback

  for (const member of source.staff_members) {
    const tier = tierFor(member.guild_id, member.discord_user_id, "staff")
    const key = ensureMembership(
      member.guild_id,
      member.discord_user_id,
      member.name,
      tier,
      periodsByMember.get(member.id) ?? [],
      String(member.id)
    )
    if (!key) {
      drop("staff member", String(member.id), "its server is not being loaded")
      continue
    }
    membershipKeyByStaffMember.set(member.id, key)
  }

  for (const admin of source.admin_users) {
    const tier = tierFor(admin.guild_id, admin.discord_user_id, "manager")
    const key = ensureMembership(
      admin.guild_id,
      admin.discord_user_id,
      null,
      tier,
      [],
      `admin:${admin.guild_id}:${admin.discord_user_id}`
    )
    if (!key) drop("admin user", `${admin.guild_id}:${admin.discord_user_id}`, "its server is not being loaded")
  }

  for (const guild of source.guilds) {
    if (ctx.venueMatch[guild.guild_id]) continue
    const ownerId = ctx.owners[guild.guild_id]
    if (!ownerId) {
      drop("venue owner", guild.guild_id, "no Discord owner was looked up for this server")
      continue
    }
    ensureMembership(guild.guild_id, ownerId, null, "owner", [], `owner:${guild.guild_id}`)
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
      if (position.role_id) existing.discord_role_id ??= position.role_id
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

  const linked = new Set(
    files.positions.membershipPositions.map((l) => `${str(l, "membership_key")}|${str(l, "position_key")}`)
  )
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
  const ourEvents = [...files.events.events]
  for (const event of source.events) {
    const venueKey = venueKeyByGuild.get(event.guild_id)
    if (!venueKey) {
      drop("event", String(event.id), "its server is not being loaded")
      continue
    }
    const start = ms(event.start_at)
    const twin = ourEvents.find(
      (e) =>
        str(e, "venue_key") === venueKey &&
        !e.cancelled_at &&
        Math.abs(ms(str(e, "starts_at")) - start) <= MATCH_WINDOW_MS
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

  const eventPositionByLegacyId = new Map<
    number,
    { key: string; eventKey: string; positionKey: string; venueKey: string }
  >()
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
    files.shifts.event_positions.push({
      key,
      venue_key: event.venueKey,
      event_key: event.key,
      position_key: positionKey,
      sort_order: order,
    })
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
    eventShiftByLegacyId.set(shift.id, {
      key,
      eventKey: ep.eventKey,
      positionKey: ep.positionKey,
      venueKey: ep.venueKey,
      start: iso(start),
      end: iso(end),
    })
    bump("event shifts created")
  }

  for (const signup of source.event_signups) {
    const es = eventShiftByLegacyId.get(signup.event_shift_id)
    if (!es) {
      drop("signup", String(signup.id), "its event shift is not being loaded")
      continue
    }
    const personKey = personByDiscord.get(signup.discord_user_id)
    const membershipKey = personKey
      ? (membershipByPersonVenue.get(`${es.venueKey}|${personKey}`)?.key as string | undefined)
      : undefined
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

  const serverLinked = new Set(
    (files.venues.externalLinks ?? [])
      .filter((l) => str(l, "provider") === "DiscordGuild")
      .map((l) => str(l, "venue_key"))
  )
  for (const guild of source.guilds) {
    const venueKey = venueKeyByGuild.get(guild.guild_id)
    if (!venueKey) continue
    if (serverLinked.has(venueKey)) {
      drop("discord link", guild.guild_id, "the venue already has a Discord server linked")
      continue
    }
    serverLinked.add(venueKey)
    const ownerDiscord = ctx.owners[guild.guild_id]
    files.venues.externalLinks = [
      ...(files.venues.externalLinks ?? []),
      {
        venue_key: venueKey,
        provider: "DiscordGuild",
        external_id: guild.guild_id,
        linked_at: ctx.now,
        linked_by_person_key: ownerDiscord ? (personByDiscord.get(ownerDiscord) ?? null) : null,
      },
    ]
    bump("Discord server links")
  }

  const listings = new Set(
    (files.venues.externalLinks ?? []).map((l) => `${str(l, "provider")}|${str(l, "external_id")}`)
  )
  const linkedVenues = new Set(
    (files.venues.externalLinks ?? [])
      .filter((l) => str(l, "provider") === "FFXIVVenues")
      .map((l) => str(l, "venue_key"))
  )
  for (const link of source.venue_links ?? []) {
    const venueKey = venueKeyByGuild.get(link.guild_id)
    const id = clean(link.ffxivvenues_id)
    if (!venueKey) drop("venue link", id, "its server is not being loaded")
    else if (!id) drop("venue link", link.guild_id, "the listing id is blank")
    else if (listings.has(`FFXIVVenues|${id}`)) drop("venue link", id, "that listing is already linked to a venue")
    else if (linkedVenues.has(venueKey))
      drop("venue link", id, "the venue already has a different FFXIV Venues listing")
    else {
      listings.add(`FFXIVVenues|${id}`)
      linkedVenues.add(venueKey)
      files.venues.externalLinks = [
        ...(files.venues.externalLinks ?? []),
        {
          venue_key: venueKey,
          provider: "FFXIVVenues",
          external_id: id,
          linked_at: link.last_synced_at ?? ctx.now,
          linked_by_person_key: null,
        },
      ]
      bump("FFXIV Venues links")
    }
  }

  const FINANCE_KINDS: Record<string, string> = { revenue: "other_income", expense: "expense", payout: "payout" }
  for (const t of source.finance_transactions ?? []) {
    const venueKey = venueKeyByGuild.get(t.guild_id)
    const kind = FINANCE_KINDS[t.entry_type]
    if (!venueKey) {
      drop("finance transaction", String(t.id), "its server is not being loaded")
      continue
    }
    if (!kind) {
      drop("finance transaction", String(t.id), `unknown entry type ${t.entry_type}`)
      continue
    }
    if (!(t.amount > 0)) {
      drop("finance transaction", String(t.id), "amount is not positive")
      continue
    }
    const posted = t.status === "posted"
    const notes = [clean(t.category), clean(t.memo)].filter(Boolean).join(": ").slice(0, 200)
    files.finance.transactions.push({
      key: `frogge:fin:${t.id}`,
      venue_key: venueKey,
      event_key: null,
      service_key: null,
      service_name: null,
      membership_key: t.staff_member_id === null ? null : (membershipKeyByStaffMember.get(t.staff_member_id) ?? null),
      recorded_by_person_key: t.recorded_by ? (personByDiscord.get(t.recorded_by) ?? null) : null,
      kind,
      amount: gilToMinorUnits(t.amount) as number,
      customer_name: null,
      notes: notes || null,
      status: posted ? "posted" : "pending",
      created_at: t.created_at,
      posted_at: posted ? (t.posted_at ?? t.created_at) : null,
    })
    bump("finance transactions")
  }

  return { files, report, venueSlugs }
}
