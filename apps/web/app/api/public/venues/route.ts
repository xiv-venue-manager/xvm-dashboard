// apps/web/app/api/public/venues/route.ts
// Public, unauthenticated venue directory for external integrations (e.g. Aetherphone).
// Kept separate from internal dashboard payloads so external consumers aren't coupled
// to internal shapes, and so internal-only fields (e.g. staffOnShift) never leak here.
import { NextRequest, NextResponse } from "next/server"
import { xvmHoursToScheduleEntries } from "@/lib/schedule-utils"
import { openingStatus } from "@/lib/api/public-venue-status"
import { getPublicHoursForVenues, listPublicDirectory, type PublicHours } from "@/lib/api/xvm-api"

export async function GET(req: NextRequest) {
  const dc = req.nextUrl.searchParams.get("dc") ?? undefined
  const now = new Date()

  const venues = await listPublicDirectory({ dataCenter: dc })

  // The directory has no cap, so this can batch well past 50 ids -
  // getPublicHoursForVenues chunks and merges rather than truncating.
  let hoursByVenue: Record<string, PublicHours> = {}
  if (venues.length > 0) {
    try {
      hoursByVenue = await getPublicHoursForVenues(
        venues.map((v) => v.id),
        14
      )
    } catch {
      hoursByVenue = {}
    }
  }

  const mapped = venues.map((v) => {
    const xvmHours = hoursByVenue[v.id]
    const scheduleEntries = xvmHours ? xvmHoursToScheduleEntries(xvmHours.rules) : []
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.data_center,
      world: v.world,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      apartment: v.room,
      logoUrl: v.logo_url,
      bannerUrl: v.banner_url,
      isAdult: v.is_adult,
      ...openingStatus(xvmHours?.open_now, now),
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
      // Schedule-only by design, unlike the web UI's open-now checks: openSince,
      // scheduledEnd and nextOpen above come from the same open_now, not from
      // staff shifts or Event records. A venue with no hours reports
      // openNow: false, schedule: [], nextOpenings: [] rather than omitting the
      // fields - external consumers should read that as "hours not set by
      // owner," not "open never."
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
