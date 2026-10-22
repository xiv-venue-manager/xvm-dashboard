import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listShifts, type ShiftRow } from "@/lib/api/xvm-api"

const SHIFT_STATUS_SHAPE: Record<ShiftRow["status"], string> = {
  pending_approval: "CLAIMED",
  scheduled: "SCHEDULED",
  active: "ACTIVE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  missed: "MISSED",
}

function toShiftShape(shift: ShiftRow) {
  return {
    id: shift.id,
    membershipId: shift.membership_id,
    roleId: shift.position_id,
    eventId: shift.event_id,
    scheduledStart: shift.scheduled_start,
    scheduledEnd: shift.scheduled_end,
    actualStart: shift.actual_start,
    actualEnd: shift.actual_end,
    status: SHIFT_STATUS_SHAPE[shift.status],
    notes: shift.notes,
  }
}

/**
 * GET /api/venues/[venueId]/shifts
 * List shifts for a venue. xvm-api requires an explicit from/to window, capped at 60 days.
 * Query params: from (ISO date), to (ISO date) for date range filtering.
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[shifts] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const url = request.nextUrl
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const to = url.searchParams.get("to") ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    try {
      const shifts = await listShifts(token, lookup.venue.id, { from, to, includeCancelled: true })
      return NextResponse.json({ shifts: shifts.map(toShiftShape) })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[shifts] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
