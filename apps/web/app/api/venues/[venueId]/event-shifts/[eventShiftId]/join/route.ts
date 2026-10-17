import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { joinEventShift } from "@/lib/api/xvm-api"
import { SHIFT_STATUS_SHAPE } from "@/lib/shift-format"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ venueId: string; eventShiftId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { venueId, eventShiftId: eventShiftIdParam } = await params
  const eventShiftId = Number(eventShiftIdParam)
  if (!Number.isInteger(eventShiftId)) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 })
  }

  const lookup = await requireMyVenue(
    session.user.id,
    venueId,
    "[event-shifts/[eventShiftId]/join] /me/venues read error"
  )
  if (!lookup.ok) return lookup.response

  try {
    const seat = await joinEventShift(token, lookup.venue.id, eventShiftId)
    return NextResponse.json(
      {
        success: true,
        shift: {
          id: seat.id,
          membershipId: seat.membership_id,
          status: SHIFT_STATUS_SHAPE[seat.status],
          scheduledStart: seat.scheduled_start,
          scheduledEnd: seat.scheduled_end,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[event-shifts] join error")
  }
}
