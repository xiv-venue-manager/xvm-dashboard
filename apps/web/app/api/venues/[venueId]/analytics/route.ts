import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  buildMoneyAnalytics,
  fetchMoneyInputs,
  recentDoorEvents,
  type AnalyticsPeriod,
} from "@/lib/api/analytics-money"
import { buildDoorAnalytics, fetchDoorInputs } from "@/lib/api/analytics-door"

/**
 * Consolidated Analytics API
 * Returns all analytics data in a single request to avoid N+1 client-side fetches
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await context.params

      // Look up venue by slug or ID
      const venue = await prisma.venue.findFirst({
        where: { OR: [{ id: venueId }, { slug: venueId }] },
        select: { id: true, name: true, xvmApiVenueId: true },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      if (!venue.xvmApiVenueId) {
        return NextResponse.json(
          { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
          { status: 409 }
        )
      }

      const token = await getValidXvmApiToken(session.user.id)
      if (!token) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }

      const now = new Date()
      const requestedPeriod = new URL(request.url).searchParams.get("period")
      const period: AnalyticsPeriod = requestedPeriod === "90d" || requestedPeriod === "all" ? requestedPeriod : "30d"

      let moneyInputs
      let doorEvents
      let doorInputs
      try {
        moneyInputs = await fetchMoneyInputs(token, venue.xvmApiVenueId, period, now)
        doorEvents = recentDoorEvents(moneyInputs, period)
        doorInputs = await fetchDoorInputs(token, venue.xvmApiVenueId, doorEvents)
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[analytics] xvm-api read error")
      }

      const money = buildMoneyAnalytics(moneyInputs, period, now)
      const door = buildDoorAnalytics(doorInputs, doorEvents)

      return NextResponse.json({
        venueId: venue.id,
        venueName: venue.name,

        // Summary stats
        summary: {
          ...money.summary,
          totalPatrons: door.totalPatrons,
          repeatRate: door.repeatRate,
        },

        // Financial summary (profit/loss analysis)
        financial: money.financial,

        // Mobile followers
        followers: door.followers,

        // Chart data
        revenueByEvent: money.revenueByEvent,
        serviceRevenue: money.serviceRevenue,
        patronByEvent: door.patronByEvent,
        attendanceByHour: door.attendanceByHour,

        // Patron mix & engagement
        patronMix: door.patronMix,
        busiestNights: door.busiestNights,

        // Metadata
        fetchedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
