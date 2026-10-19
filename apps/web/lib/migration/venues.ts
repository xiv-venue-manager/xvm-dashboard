export interface ExportedVenue {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  galleryImages: string[]
  dataCenter: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  apartment: number | null
  currencyName: string
  settings: Record<string, unknown>
  venueType: string | null
  partakeTeamId: number | null
  ffxivVenueId: string | null
  ffxivVenueLinkedAt: string | null
  ffxivVenueLinkedBy: string | null
  froggeVenueId: string | null
  discordServerId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  ownerCount: number
  hasContent: boolean
}

export interface VenuesExport {
  venues: ExportedVenue[]
}

export interface VenuesContext {
  personKeys: ReadonlySet<string>
  timezones: ReadonlyMap<string, string>
  skipTestVenues: boolean
}

export interface VenueRow {
  key: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  banner_url: string | null
  venue_type: string | null
  data_center: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  room: number | null
  timezone: string
  currency_name: string
  task_visibility: string
  sales_visibility: string
  revenue_visibility: string
  event_visibility: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ExternalLinkRow {
  venue_key: string
  provider: "Partake" | "FFXIVVenues"
  external_id: string
  linked_at: string
  linked_by_person_key: string | null
}

export interface VenueImageRow {
  venue_key: string
  image_url: string
  sort_order: number
}

export interface VenueLeftover {
  venue_key: string
  settings: Record<string, unknown>
}

export interface VenuesResult {
  venues: VenueRow[]
  externalLinks: ExternalLinkRow[]
  images: VenueImageRow[]
  leftovers: VenueLeftover[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const VOCABULARY = {
  taskVisibility: ["all", "assigned", "assigned_unassigned"],
  salesVisibility: ["all", "own", "none"],
  revenueVisibility: ["all", "hide", "own"],
  eventVisibility: ["all", "published"],
} as const
const NO_HOME = ["tagline", "tags", "isAdult", "openNights", "defaultHours", "shiftBot", "notifications"] as const
const MAX_NAME = 100
const MAX_SHORT = 32
const MAX_URL = 500

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

const anyOn = (value: unknown): boolean =>
  typeof value === "object" && value !== null && Object.values(value).some((v) => (typeof v === "string" ? v.trim() !== "" : Boolean(v)))

export function mapVenues(source: VenuesExport, ctx: VenuesContext): VenuesResult {
  const result: VenuesResult = { venues: [], externalLinks: [], images: [], leftovers: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const slugs = new Set<string>()
  const taken = new Set<string>()
  let defaultedVisibility = 0
  let droppedImages = 0
  let duplicateImages = 0
  let testVenues = 0
  let ownerless = 0
  let frogge = 0
  let webhookFlags = 0
  let webhookUrls = 0
  let unusedDiscord = 0

  for (const v of [...source.venues].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (v.ownerCount === 0 && !v.hasContent) {
      skip(v.id, "no owner and nothing in it")
      continue
    }
    if (v.venueType === "TEST_VENUE") {
      if (ctx.skipTestVenues) {
        skip(v.id, "test venue, left out by decision")
        continue
      }
      testVenues++
    }
    if (v.ownerCount === 0) ownerless++

    const name = squash(v.name)
    const slug = v.slug.trim().toLowerCase()
    if (!name || name.length > MAX_NAME) {
      skip(v.id, "name is blank or over 100 characters")
      continue
    }
    if (!slug || slug.length > MAX_NAME || slugs.has(slug)) {
      skip(v.id, "slug is blank, too long or already used")
      continue
    }
    if (v.dataCenter.length > MAX_SHORT || v.world.length > MAX_SHORT || (v.district ?? "").length > MAX_SHORT) {
      skip(v.id, "data centre, world or district over 32 characters")
      continue
    }
    slugs.add(slug)

    const visibility: Record<string, string> = {}
    for (const [key, allowed] of Object.entries(VOCABULARY)) {
      const value = v.settings[key]
      if (typeof value === "string" && (allowed as readonly string[]).includes(value)) visibility[key] = value
      else {
        visibility[key] = "all"
        defaultedVisibility++
      }
    }

    const keepUrl = (url: string | null, label: string) => {
      if (url === null || !url.trim()) return null
      if (url.trim().length > MAX_URL) {
        warn(v.id, `${label} over ${MAX_URL} characters, left empty`)
        return null
      }
      return url.trim()
    }

    result.venues.push({
      key: v.id,
      name,
      slug,
      description: v.description === null ? null : v.description.trim() || null,
      logo_url: keepUrl(v.logoUrl, "logo"),
      banner_url: keepUrl(v.bannerUrl, "banner"),
      venue_type: v.venueType,
      data_center: v.dataCenter,
      world: v.world,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      room: v.apartment,
      timezone: ctx.timezones.get(v.id) ?? "UTC",
      currency_name: squash(v.currencyName).slice(0, MAX_SHORT) || "Gil",
      task_visibility: visibility.taskVisibility,
      sales_visibility: visibility.salesVisibility,
      revenue_visibility: visibility.revenueVisibility,
      event_visibility: visibility.eventVisibility,
      is_active: v.isActive,
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    })

    if (v.partakeTeamId !== null) {
      const id = String(v.partakeTeamId)
      if (taken.has(`Partake|${id}`)) warn(v.id, `Partake team ${id} is already linked to another venue, link not carried`)
      else {
        taken.add(`Partake|${id}`)
        result.externalLinks.push({ venue_key: v.id, provider: "Partake", external_id: id, linked_at: v.createdAt, linked_by_person_key: null })
      }
    }
    if (v.ffxivVenueId !== null) {
      const id = v.ffxivVenueId.trim()
      if (!id || taken.has(`FFXIVVenues|${id}`)) warn(v.id, "ffxivvenues.com id is blank or already linked to another venue, link not carried")
      else {
        taken.add(`FFXIVVenues|${id}`)
        result.externalLinks.push({
          venue_key: v.id,
          provider: "FFXIVVenues",
          external_id: id,
          linked_at: v.ffxivVenueLinkedAt ?? v.createdAt,
          linked_by_person_key: v.ffxivVenueLinkedBy !== null && ctx.personKeys.has(v.ffxivVenueLinkedBy) ? v.ffxivVenueLinkedBy : null,
        })
      }
    }

    const seenImages = new Set<string>()
    let order = 0
    for (const raw of v.galleryImages) {
      const url = raw.trim()
      if (!url || url.length > MAX_URL) {
        droppedImages++
        continue
      }
      if (seenImages.has(url)) {
        duplicateImages++
        continue
      }
      seenImages.add(url)
      result.images.push({ venue_key: v.id, image_url: url, sort_order: order++ })
    }

    const leftover: Record<string, unknown> = {}
    for (const key of NO_HOME) if (v.settings[key] !== undefined) leftover[key] = v.settings[key]
    if (Object.keys(leftover).length > 0) result.leftovers.push({ venue_key: v.id, settings: leftover })

    if (v.froggeVenueId !== null) frogge++
    if (anyOn(v.settings.webhooks)) webhookFlags++
    if (anyOn(v.settings.discordWebhooks)) webhookUrls++
    if (v.discordServerId !== null && v.discordServerId.trim()) unusedDiscord++
  }

  if (defaultedVisibility > 0) warn("venues", `${defaultedVisibility} visibility settings were missing or unknown, set to all`)
  if (droppedImages > 0) warn("venues", `${droppedImages} gallery images were blank or over ${MAX_URL} characters, not carried`)
  if (duplicateImages > 0) warn("venues", `${duplicateImages} repeated gallery images were collapsed to one`)
  if (testVenues > 0) warn("venues", `${testVenues} test venues are included, pass skipTestVenues to leave them out`)
  if (ownerless > 0) warn("venues", `${ownerless} venues have content but no active owner`)
  if (frogge > 0) warn("venues", `${frogge} venues are connected to Frogge, the connection is not migrated`)
  if (webhookFlags > 0) warn("venues", `${webhookFlags} venues have a webhook flag switched on, which is retiring and not migrated`)
  if (webhookUrls > 0) warn("venues", `${webhookUrls} venues have Discord webhook addresses, which are retiring and not migrated`)
  if (unusedDiscord > 0) warn("venues", `${unusedDiscord} venues have the deprecated Discord server id, connect them from the dashboard`)
  return result
}
