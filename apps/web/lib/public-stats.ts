import { prisma } from "@/lib/prisma"
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

async function computeStats(): Promise<PublicStats> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    platform,
    activeVenueIds,
    pluginInstalls,
    patronEntriesTotal,
    salesAgg,
    shiftsTotal,
    shiftsThisWeek,
    newVenuesThisWeek,
    tasksCompleted,
    dcRows,
    dcCounts,
    firstVenue,
    lastSale,
    lastPatron,
    venueTypeCounts,
  ] = await Promise.all([
    getPublicPlatformStats(),
    prisma.venue.findMany({
      where: {
        isActive: true,
        OR: [
          { events: { some: { startTime: { gte: since30d } } } },
          { transactions: { some: { createdAt: { gte: since30d } } } },
          { patronLogs: { some: { loggedAt: { gte: since30d } } } },
        ],
      },
      select: { id: true },
    }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.patronLog.count(),
    prisma.transaction.aggregate({ _count: true, _sum: { amount: true } }),
    prisma.shift.count(),
    prisma.shift.count({ where: { createdAt: { gte: since7d } } }),
    prisma.venue.count({ where: { isActive: true, createdAt: { gte: since7d } } }),
    prisma.task.count({ where: { completedAt: { not: null } } }),
    prisma.venue.findMany({ where: { isActive: true }, select: { dataCenter: true }, distinct: ["dataCenter"] }),
    prisma.venue.groupBy({
      by: ["dataCenter"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { dataCenter: "desc" } },
    }),
    prisma.venue.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.transaction.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.patronLog.findFirst({ orderBy: { loggedAt: "desc" }, select: { loggedAt: true } }),
    prisma.venue.groupBy({
      by: ["venueType"],
      where: { isActive: true, venueType: { not: null }, NOT: { venueType: "TEST_VENUE" } },
      _count: { _all: true },
      orderBy: { _count: { venueType: "desc" } },
    }),
  ])

  // Busiest nights: xvm-api's weekday-by-hour grid, Monday first, in each venue's own time
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const dayCounts = platform.events_by_weekday_hour_last_90d.map((hours) => hours.reduce((sum, n) => sum + n, 0))
  const maxDay = Math.max(...dayCounts, 1)
  const busiestNights = dayNames.map((day, i) => ({
    day,
    count: dayCounts[i],
    pct: Math.round((dayCounts[i] / maxDay) * 100),
  }))

  const venueTypeLabels: Record<string, string> = {
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
  const totalTyped = venueTypeCounts.reduce((s, r) => s + r._count._all, 0) || 1
  const venueTypeBreakdown = venueTypeCounts.map((r) => ({
    type: r.venueType as string,
    label: venueTypeLabels[r.venueType as string] ?? (r.venueType as string),
    count: r._count._all,
    pct: Math.round((r._count._all / totalTyped) * 100),
  }))

  const lastActivity =
    [lastSale?.createdAt, lastPatron?.loggedAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    venuesTotal: platform.venues_total,
    venuesActive30d: activeVenueIds.length,
    pluginInstalls,
    eventsTotal: platform.events_total,
    eventsThisWeek: platform.events_last_7d,
    patronEntriesTotal,
    salesTotal: salesAgg._count,
    shiftsTotal,
    shiftsThisWeek,
    newVenuesThisWeek,
    tasksCompleted,
    partakeEventsSynced: platform.events_partake_linked,
    gilTracked: Number(salesAgg._sum.amount ?? 0),
    dataCenters: dcRows.length,
    dcBreakdown: dcCounts.map((r) => ({ dataCenter: r.dataCenter, count: r._count._all })),
    venueTypeBreakdown,
    busiestNights,
    firstVenueAt: firstVenue?.createdAt.toISOString() ?? null,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    generatedAt: new Date().toISOString(),
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  return getOrSet(cacheKeys.publicStats(), computeStats, cacheTTL.publicStats)
}
