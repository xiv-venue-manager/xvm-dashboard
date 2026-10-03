import { getOrSet, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { getPublicPlatformStats } from "@/lib/api/xvm-api"

export interface PublicStats {
  venuesTotal: number
  venuesActive30d: number
  pluginInstalls: number
  eventsTotal: number
  eventsThisWeek: number
  patronEntriesTotal: number
  salesTotal: number
  shiftsTotal: number
  shiftsThisWeek: number
  newVenuesThisWeek: number
  tasksCompleted: number
  partakeEventsSynced: number
  gilTracked: number
  dataCenters: number
  dcBreakdown: Array<{ dataCenter: string; count: number }>
  venueTypeBreakdown: Array<{ type: string; label: string; count: number; pct: number }>
  busiestNights: Array<{ day: string; count: number; pct: number }>
  firstVenueAt: string | null
  lastActivityAt: string | null
  generatedAt: string
}

const INCOME_KINDS = ["sale", "tip", "cover_charge", "other_income"]

const VENUE_TYPE_LABELS: Record<string, string> = {
  BAR_TAVERN: "Bar / Tavern",
  NIGHTCLUB: "Nightclub",
  LOUNGE: "Lounge",
  HOST_CLUB: "Host Club",
  CABARET: "Cabaret",
  BATHHOUSE: "Bathhouse",
  CASINO: "Casino",
  STUDIO: "Creative Studio",
  OTHER: "Other",
}

function byCountDesc<T extends { count: number }>(rows: T[], name: (row: T) => string): T[] {
  return rows.sort((a, b) => b.count - a.count || name(a).localeCompare(name(b)))
}

async function computeStats(): Promise<PublicStats> {
  const platform = await getPublicPlatformStats()

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const dayCounts = platform.events_by_weekday_hour_last_90d.map((hours) => hours.reduce((sum, n) => sum + n, 0))
  const maxDay = Math.max(...dayCounts, 1)
  const busiestNights = dayNames.map((day, i) => ({
    day,
    count: dayCounts[i],
    pct: Math.round((dayCounts[i] / maxDay) * 100),
  }))

  const dcBreakdown = byCountDesc(
    Object.entries(platform.venues_by_data_center).map(([dataCenter, count]) => ({ dataCenter, count })),
    (row) => row.dataCenter,
  )

  const typed = Object.entries(platform.venues_by_type)
  const totalTyped = typed.reduce((sum, [, count]) => sum + count, 0) || 1
  const venueTypeBreakdown = byCountDesc(
    typed.map(([type, count]) => ({
      type,
      label: VENUE_TYPE_LABELS[type] ?? type,
      count,
      pct: Math.round((count / totalTyped) * 100),
    })),
    (row) => row.type,
  )

  const income = INCOME_KINDS.map((kind) => platform.transactions_by_kind[kind])
  const salesTotal = income.reduce((sum, totals) => sum + (totals?.count ?? 0), 0)
  const gilTracked = income.reduce((sum, totals) => sum + (totals?.amount_sum ?? 0), 0)

  return {
    venuesTotal: platform.venues_total,
    venuesActive30d: platform.venues_active_last_30d,
    pluginInstalls: platform.plugin_installs,
    eventsTotal: platform.events_total,
    eventsThisWeek: platform.events_last_7d,
    patronEntriesTotal: platform.patron_entries_total,
    salesTotal,
    shiftsTotal: platform.shifts_total,
    shiftsThisWeek: platform.shifts_created_last_7d,
    newVenuesThisWeek: platform.venues_created_last_7d,
    tasksCompleted: platform.tasks_completed,
    partakeEventsSynced: platform.events_partake_linked,
    gilTracked,
    dataCenters: dcBreakdown.length,
    dcBreakdown,
    venueTypeBreakdown,
    busiestNights,
    firstVenueAt: platform.first_venue_at,
    lastActivityAt: platform.last_activity_at,
    generatedAt: new Date().toISOString(),
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  return getOrSet(cacheKeys.publicStats(), computeStats, cacheTTL.publicStats)
}
