import { NextResponse } from "next/server"
import { deleteEventShift } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ venueId: string; eventShiftId: string }> }
) {
  const { venueId, eventShiftId: shiftParam } = await params
  const eventShiftId = parseId(shiftParam)
  if (eventShiftId === null) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

  return withVenueAction(venueId, "event-shifts DELETE", async (token, xvmApiVenueId) => {
    await deleteEventShift(token, xvmApiVenueId, eventShiftId)
    return NextResponse.json({ success: true })
  })
}
