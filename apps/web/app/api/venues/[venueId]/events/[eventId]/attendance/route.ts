import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getEvent, type PatronLogRow } from "@/lib/api/xvm-api"
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

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
      const readXvm = await xvmPageReader(session.user.id, venue?.xvmApiVenueId ?? null)

      if (!/^\d+$/.test(eventId)) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }
      const event = await readXvm("attendance event", null, (t, v) => getEvent(t, v, Number(eventId)))
      if (!event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }

      const logs = (
        await readXvm("attendance logs", [] as PatronLogRow[], (t, v) =>
          listAllPatronLogs(t, v, { eventId: Number(eventId), classification: "patron" })
        )
      ).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime() || a.id - b.id)

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
