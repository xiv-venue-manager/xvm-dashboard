import { NextResponse } from "next/server"
import { removeEventPosition } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ venueId: string; eventId: string; eventPositionId: string }> }
) {
  const { venueId, eventId: eventIdParam, eventPositionId: positionParam } = await params
  const eventId = parseId(eventIdParam)
  const eventPositionId = parseId(positionParam)
  if (eventId === null || eventPositionId === null) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 })
  }

  return withVenueAction(venueId, "roster positions DELETE", async (token, xvmApiVenueId) => {
    await removeEventPosition(token, xvmApiVenueId, eventId, eventPositionId)
    return NextResponse.json({ success: true })
  })
}
