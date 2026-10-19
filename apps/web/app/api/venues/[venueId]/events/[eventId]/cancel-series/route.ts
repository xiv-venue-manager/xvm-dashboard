import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { endEventSeries, getEvent } from "@/lib/api/xvm-api"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; eventId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { venueId, eventId } = await params

  if (!/^\d+$/.test(eventId)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  const lookup = await requireMyVenue(session.user.id, venueId, "[events] cancel-series /me/venues read error")
  if (!lookup.ok) return lookup.response

  try {
    const event = await getEvent(token, lookup.venue.id, Number(eventId))
    if (event.recurrence_rule_id === null) {
      return NextResponse.json({ cancelled: 0 })
    }
    const ended = await endEventSeries(token, lookup.venue.id, event.recurrence_rule_id, {
      cancel_future: true,
      reason: null,
    })
    return NextResponse.json({ cancelled: ended.cancelled })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[events] cancel-series error")
  }
}
