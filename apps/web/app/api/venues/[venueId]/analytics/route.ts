import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { subDays } from "date-fns"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { buildMoneyAnalytics, fetchMoneyInputs, type AnalyticsPeriod } from "@/lib/api/analytics-money"
import { canManageVenue } from "@/lib/roles"

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

      const { params } = context
      const { venueId } = await params

      // Look up venue by slug or ID
      const venue = await prisma.venue.findFirst({
        where: {
          OR: [{ id: venueId }, { slug: venueId }],
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      if (!canManageVenue(membership.role)) {
        return NextResponse.json({ error: "Only owners and managers can view analytics" }, { status: 403 })
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

      // Period filter from query string
      const { searchParams } = new URL(request.url)
      const requestedPeriod = searchParams.get("period")
      const period: AnalyticsPeriod = requestedPeriod === "90d" || requestedPeriod === "all" ? requestedPeriod : "30d"
      const periodStart = period === "90d" ? subDays(now, 90) : period === "all" ? undefined : subDays(now, 30)
      const eventLimit = period === "all" ? 100 : period === "90d" ? 40 : 20

      let money
      try {
        money = buildMoneyAnalytics(await fetchMoneyInputs(token, venue.xvmApiVenueId, period, now), period, now)
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[analytics] xvm-api read error")
      }

      // Fetch all data in parallel for better performance
      const [
        allEvents,
        allPatronLogs,
        followerCount,
        followersByMonth,
        patronVisits,
      ] = await Promise.all([
        // Get all events with basic info
        prisma.event.findMany({
          where: {
            venueId: venue.id,
            ...(periodStart ? { startTime: { gte: periodStart } } : {}),
          },
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
          },
          orderBy: { startTime: "desc" },
          take: eventLimit,
        }),

        // Get all patron logs
        prisma.patronLog.findMany({
          where: { venueId: venue.id },
          select: {
            id: true,
            eventId: true,
            countChange: true,
            timestamp: true,
          },
          orderBy: { timestamp: "asc" },
        }),

        // Follower count
        prisma.venueFollow.count({ where: { venueId: venue.id } }),

        // Followers gained by month (last 6 months)
        prisma.venueFollow.findMany({
          where: {
            venueId: venue.id,
            createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
          },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),

        // Patron visit counts per character (for New/Regular/VIP mix)
        prisma.patronLog.groupBy({
          by: ["characterName"],
          where: {
            venueId: venue.id,
            characterName: { not: null },
            wasWorking: false,
            action: "ENTER",
          },
          _count: { _all: true },
          orderBy: { characterName: "asc" },
          take: 2000,
        }),
      ])

      // Process events for different views
      const completedOrActiveEvents = allEvents.filter((e) => e.status === "COMPLETED" || e.status === "ACTIVE")

      // Last 7 events for patron chart
      const last7Events = completedOrActiveEvents.slice(0, 7).reverse()

      // Calculate patron data per event
      const patronByEvent = last7Events.map((event) => {
        const eventLogs = allPatronLogs.filter((log) => log.eventId === event.id)

        // Calculate peak patron count
        let currentCount = 0
        let maxCount = 0
        eventLogs.forEach((log) => {
          currentCount += log.countChange ?? 0
          maxCount = Math.max(maxCount, currentCount)
        })

        return {
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          peakPatrons: Math.max(maxCount, 0),
        }
      })

      // Calculate average hourly attendance across recent events (for trends)
      const attendanceTrends: Record<string, { total: number; count: number }> = {}

      completedOrActiveEvents.slice(0, 20).forEach((event) => {
        const eventLogs = allPatronLogs.filter((log) => log.eventId === event.id)
        if (eventLogs.length === 0) return

        // Build time series for this event
        const eventStart = new Date(event.startTime)
        const eventEnd = new Date(event.endTime)

        let currentTime = new Date(eventStart)
        let currentCount = 0
        let logIndex = 0

        // Determine actual end time (event end or last log, whichever is later)
        const lastLog = eventLogs[eventLogs.length - 1]
        const actualEnd = lastLog && new Date(lastLog.timestamp) > eventEnd ? new Date(lastLog.timestamp) : eventEnd

        // Process in 15-minute intervals
        while (currentTime <= actualEnd) {
          // Apply all logs up to current time
          while (logIndex < eventLogs.length) {
            const logTime = new Date(eventLogs[logIndex].timestamp)
            if (logTime > currentTime) break
            currentCount += eventLogs[logIndex].countChange ?? 0
            logIndex++
          }

          if (currentCount < 0) currentCount = 0

          // Record by HH:mm time slot
          const timeKey = currentTime.toTimeString().substring(0, 5) // "HH:mm"
          if (!attendanceTrends[timeKey]) {
            attendanceTrends[timeKey] = { total: 0, count: 0 }
          }
          attendanceTrends[timeKey].total += currentCount
          attendanceTrends[timeKey].count += 1

          // Advance 15 minutes
          currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000)

          // Safety: don't process forever (max 48 hours)
          if (currentTime.getTime() - eventStart.getTime() > 48 * 60 * 60 * 1000) break
        }
      })

      // Convert to sorted array
      const attendanceByHour = Object.entries(attendanceTrends)
        .map(([time, data]) => ({
          time,
          avgCount: Math.round(data.total / data.count),
        }))
        .sort((a, b) => a.time.localeCompare(b.time))

      // Patron mix — categorise by visit count
      const mixNew = patronVisits.filter((p) => p._count._all <= 2).length
      const mixRegular = patronVisits.filter((p) => p._count._all >= 3 && p._count._all <= 9).length
      const mixVip = patronVisits.filter((p) => p._count._all >= 10).length
      const mixTotal = patronVisits.length || 1 // avoid /0

      // Busiest nights — day-of-week distribution from patron ENTER logs
      const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const dayTotals = new Array(7).fill(0)
      for (const log of allPatronLogs) {
        if (log.countChange && log.countChange > 0) {
          dayTotals[new Date(log.timestamp).getUTCDay()]++
        }
      }
      const maxDay = Math.max(...dayTotals, 1)
      const busiestNights = DAY_NAMES.map((name, i) => ({
        day: name,
        count: dayTotals[i],
        pct: Math.round((dayTotals[i] / maxDay) * 100),
      }))

      const totalPatrons = patronByEvent.reduce((sum, e) => sum + e.peakPatrons, 0)
      // Repeat rate: patrons with 3+ visits / total unique patrons
      const repeatRate = mixTotal > 1 ? Math.round(((mixRegular + mixVip) / mixTotal) * 100) : 0

      return NextResponse.json({
        venueId: venue.id,
        venueName: venue.name,

        // Summary stats
        summary: {
          ...money.summary,
          totalPatrons,
          repeatRate,
        },

        // Financial summary (profit/loss analysis)
        financial: money.financial,

        // Mobile followers
        followers: {
          total: followerCount,
          byMonth: followersByMonth.reduce<Record<string, number>>((acc, f) => {
            const key = f.createdAt.toISOString().slice(0, 7) // YYYY-MM
            acc[key] = (acc[key] ?? 0) + 1
            return acc
          }, {}),
        },

        // Chart data
        revenueByEvent: money.revenueByEvent,
        serviceRevenue: money.serviceRevenue,
        patronByEvent,
        attendanceByHour,

        // Patron mix & engagement
        patronMix: {
          new: mixNew,
          regular: mixRegular,
          vip: mixVip,
          total: mixTotal,
          newPct: Math.round((mixNew / mixTotal) * 100),
          regularPct: Math.round((mixRegular / mixTotal) * 100),
          vipPct: Math.round((mixVip / mixTotal) * 100),
        },
        busiestNights,

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
