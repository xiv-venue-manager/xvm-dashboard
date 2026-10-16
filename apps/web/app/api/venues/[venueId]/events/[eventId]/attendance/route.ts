import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { requireMyVenue } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getEvent } from "@/lib/api/xvm-api"
import { listAllPatronLogs } from "@/lib/api/patron-logs"

/**
 * GET - Get attendance data for a specific event formatted for charts
 * Returns time-series data of patron count over the event duration
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
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
      const { venueId, eventId } = await params

      const lookup = await requireMyVenue(session.user.id, venueId, "[attendance] /me/venues read error")
      if (!lookup.ok) return lookup.response

      const token = await getValidXvmApiToken(session.user.id)
      if (!token) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }

      if (!/^\d+$/.test(eventId)) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }

      let logs
      try {
        await getEvent(token, lookup.venue.id, Number(eventId))
        logs = await listAllPatronLogs(token, lookup.venue.id, { eventId: Number(eventId), classification: "patron" })
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[attendance] xvm-api read error")
      }
      logs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime() || a.id - b.id)

      // If no logs, return empty array
      if (logs.length === 0) {
        return NextResponse.json([])
      }

      // Build time-series data showing cumulative count at each log point
      let runningCount = 0
      const attendanceData = logs.map((log) => {
        runningCount += log.count_change ?? 0
        return {
          time: new Date(log.ts).toISOString(),
          count: Math.max(0, runningCount), // Never show negative
        }
      })

      return NextResponse.json(attendanceData)
    } catch (error) {
      console.error("Error fetching event attendance:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
