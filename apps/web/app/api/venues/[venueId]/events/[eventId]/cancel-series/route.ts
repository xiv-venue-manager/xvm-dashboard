import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return NextResponse.json(
      { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
      { status: 409 }
    )
  }

  try {
    const event = await getEvent(token, venue.xvmApiVenueId, Number(eventId))
    if (event.recurrence_rule_id === null) {
      return NextResponse.json({ cancelled: 0 })
    }
    const ended = await endEventSeries(token, venue.xvmApiVenueId, event.recurrence_rule_id, {
      cancel_future: true,
      reason: null,
    })
    return NextResponse.json({ cancelled: ended.cancelled })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[events] cancel-series error")
  }
}
