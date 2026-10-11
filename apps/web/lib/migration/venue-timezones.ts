export interface VenueTimezoneInput {
  id: string
  name: string
  slug: string
  dataCenter: string
  world: string
  isActive: boolean
  timezones: { timezone: string; count: number }[]
}

export type Confidence = "one_zone" | "mixed" | "none"

export interface VenueTimezoneRow {
  venue_key: string
  name: string
  slug: string
  data_center: string
  world: string
  is_active: boolean
  timezone: string
  confidence: Confidence
  share: number | null
  suspect: boolean
  counts: { timezone: string; count: number }[]
  note: string
}

export interface VenueTimezoneResult {
  venues: VenueTimezoneRow[]
  summary: { total: number; oneZone: number; mixed: number; none: number; suspect: number }
}

const FALLBACK = "UTC"

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function proposeVenueTimezones(venues: VenueTimezoneInput[]): VenueTimezoneResult {
  const rows: VenueTimezoneRow[] = []

  for (const v of [...venues].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    const counts = v.timezones
      .filter((t) => t.count > 0)
      .map((t) => ({ timezone: t.timezone, count: t.count }))
      .sort((a, b) => b.count - a.count || a.timezone.localeCompare(b.timezone))
    const total = counts.reduce((sum, t) => sum + t.count, 0)

    const base = {
      venue_key: v.id,
      name: v.name,
      slug: v.slug,
      data_center: v.dataCenter,
      world: v.world,
      is_active: v.isActive,
      counts,
    }

    if (counts.length === 0) {
      rows.push({ ...base, timezone: FALLBACK, confidence: "none", share: null, suspect: false, note: "no events to learn a timezone from, UTC keeps the old times exactly" })
      continue
    }

    const top = counts[0]
    if (!isTimezone(top.timezone)) {
      rows.push({ ...base, timezone: FALLBACK, confidence: "none", share: null, suspect: false, note: `${JSON.stringify(top.timezone)} is not a timezone, used UTC` })
      continue
    }
    const confidence: Confidence = counts.length === 1 ? "one_zone" : "mixed"
    const suspect = top.timezone === FALLBACK
    const share = Math.round((top.count / total) * 100) / 100
    const note = suspect
      ? "its events are mostly UTC, which may only mean the timezone was never set"
      : confidence === "mixed"
        ? `${counts.length} timezones across its events, the most common is used`
        : "all its events use this timezone"
    rows.push({ ...base, timezone: top.timezone, confidence, share, suspect, note })
  }

  return {
    venues: rows,
    summary: {
      total: rows.length,
      oneZone: rows.filter((r) => r.confidence === "one_zone").length,
      mixed: rows.filter((r) => r.confidence === "mixed").length,
      none: rows.filter((r) => r.confidence === "none").length,
      suspect: rows.filter((r) => r.suspect).length,
    },
  }
}
