import { NextResponse } from "next/server"
import { applyEventRosterToFuture } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

export async function POST(_request: Request, { params }: { params: Promise<{ venueId: string; eventId: string }> }) {
  const { venueId, eventId: eventIdParam } = await params
  const eventId = parseId(eventIdParam)
  if (eventId === null) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  return withVenueAction(venueId, "roster apply POST", async (token, xvmApiVenueId) => {
    const result = await applyEventRosterToFuture(token, xvmApiVenueId, eventId)
    return NextResponse.json(result)
  })
}
