// apps/web/app/api/public/venues/route.ts
// Public, unauthenticated venue directory for external integrations (e.g. Aetherphone).
// Kept separate from internal dashboard payloads so external consumers aren't coupled
// to internal shapes, and so internal-only fields (e.g. staffOnShift) never leak here.
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseVenueSettings } from "@/lib/types/venue-settings"
import { xvmHoursToScheduleEntries } from "@/lib/schedule-utils"
import { getPublicHoursForVenues, getPublicVenuesForIds, type PublicHours, type PublicVenue } from "@/lib/api/xvm-api"

export async function GET(req: NextRequest) {
  const dc = req.nextUrl.searchParams.get("dc") ?? undefined
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(dc ? { dataCenter: { equals: dc, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      slug: true,
      dataCenter: true,
      world: true,
      settings: true,
      xvmApiVenueId: true,
      shifts: {
        where: {
          OR: [
            {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
            {
              status: "SCHEDULED",
              scheduledStart: { gt: now, lte: endOfDay },
            },
          ],
        },
        select: {
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  // xvm-api is the source of truth for hours - Prisma's scheduleEntries and
  // venueSchedule tables are retired from this contract entirely. No `take`
  // cap on the venue query above, so this can batch well past 50 ids -
  // getPublicHoursForVenues chunks and merges rather than truncating.
  const xvmVenueIds = venues.map((v) => v.xvmApiVenueId).filter((id): id is string => id !== null)
  let hoursByVenue: Record<string, PublicHours> = {}
  let profileByVenue: Record<string, PublicVenue> = {}
  if (xvmVenueIds.length > 0) {
    try {
      hoursByVenue = await getPublicHoursForVenues(xvmVenueIds, 14)
    } catch {
      hoursByVenue = {}
    }
    profileByVenue = await getPublicVenuesForIds(xvmVenueIds)
  }

  const mapped = venues.map((v) => {
    const activeShift = v.shifts.find((s) => s.status === "ACTIVE")
    const tonightShift = v.shifts.find((s) => s.status === "SCHEDULED")
    const settings = parseVenueSettings(v.settings)
    const xvmHours = v.xvmApiVenueId ? hoursByVenue[v.xvmApiVenueId] : undefined
    const xvmProfile = v.xvmApiVenueId ? profileByVenue[v.xvmApiVenueId] : undefined
    const scheduleEntries = xvmHours ? xvmHoursToScheduleEntries(xvmHours.rules) : []
    return {
      id: v.id,
      name: xvmProfile?.name ?? v.slug,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      district: xvmProfile?.district ?? null,
      ward: xvmProfile?.ward ?? null,
      plot: xvmProfile?.plot ?? null,
      apartment: xvmProfile?.room ?? null,
      logoUrl: xvmProfile?.logo_url ?? null,
      bannerUrl: xvmProfile?.banner_url ?? null,
      isAdult: settings.isAdult ?? false,
      openSince: activeShift ? (activeShift.actualStart ?? activeShift.scheduledStart) : null,
      scheduledEnd: activeShift?.scheduledEnd ?? tonightShift?.scheduledEnd ?? null,
      nextOpen: tonightShift?.scheduledStart ?? null,
      // Recurring opening-hours pattern, all times UTC / FFXIV Server Time.
      schedule: scheduleEntries.map((e) => ({
        day: e.day,
        startHour: e.startHour,
        startMin: e.startMin,
        endHour: e.endHour,
        endMin: e.endMin,
        crossesMidnight: e.crossesMidnight,
        interval: e.interval,
        weekOfMonth: e.weekOfMonth,
        commencing: e.commencing,
        label: e.label,
      })),
      // Schedule-only by design, unlike the web UI's open-now checks: this contract
      // is driven by staff shifts (openSince/nextOpen above), not Event records.
      // xvm-api's own open_now.open is schedule-only too (no Event awareness),
      // so this stays a clean drop-in rather than a semantic change.
      // A venue with no xvmApiVenueId (not yet migrated) reports openNow: false,
      // schedule: [], nextOpenings: [] rather than omitting the fields - external
      // consumers should read that as "hours not set by owner," not "open never."
      openNow: xvmHours?.open_now.open ?? false,
      // Straight from xvm-api's own occurrence engine (upcoming = occurrences_in
      // the requested window, in-progress ones included, sorted soonest-first) -
      // not re-derived from scheduleEntries. That local re-derivation used to
      // disagree with openNow for a monthly_by_date rule, which
      // xvmHoursToScheduleEntries can't represent and drops (schedule/nextOpenings
      // would go empty) but xvm-api's own openNow still honors. schedule above
      // still needs the converter since the contract wants rule shapes - monthly_by_date
      // rules are simply absent from it.
      nextOpenings: (xvmHours?.upcoming ?? []).slice(0, 5).map((o) => ({ start: o.starts_at, end: o.ends_at })),
    }
  })

  // Sort: open now first, tonight next, alphabetical last
  mapped.sort((a, b) => {
    const aOpen = a.openSince != null
    const bOpen = b.openSince != null
    const aTonight = a.nextOpen != null
    const bTonight = b.nextOpen != null
    if (aOpen && !bOpen) return -1
    if (!aOpen && bOpen) return 1
    if (aTonight && !bTonight) return -1
    if (!aTonight && bTonight) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(mapped)
}
