import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { pluginXvmContext } from "@/lib/api/plugin-xvm"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listEventsInRange } from "@/lib/api/event-window"

const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId) {
      return NextResponse.json({ error: "Missing venueId" }, { status: 400 })
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Venue not authorized for this key" }, { status: 403 })
    }

    const context = await pluginXvmContext(auth.userId, venueId)
    if ("error" in context) return context.error

    const now = new Date()
    let events
    try {
      events = await listEventsInRange(
        context.token,
        context.xvmApiVenueId,
        new Date(now.getTime() - LOOKBACK_MS),
        new Date(now.getTime() + LOOKAHEAD_MS),
        { now }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[Plugin API] active event error")
    }

    const event = events.filter((e) => e.status === "ACTIVE").pop()
    if (!event) {
      return NextResponse.json({ active: false })
    }

    return NextResponse.json({
      active: true,
      eventId: event.id,
      title: event.title,
      scheduledStart: event.startTime.toISOString(),
      scheduledEnd: event.endTime.toISOString(),
      status: event.status,
    })
  } catch (error) {
    console.error("[Plugin API] Error fetching active event:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
