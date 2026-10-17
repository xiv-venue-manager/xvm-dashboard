import { NextResponse } from "next/server"
import { z } from "zod"
import { assignEventShift } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

const bodySchema = z.object({ membershipId: z.number().int() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ venueId: string; eventShiftId: string }> }
) {
  const { venueId, eventShiftId: shiftParam } = await params
  const eventShiftId = parseId(shiftParam)
  if (eventShiftId === null) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose a staff member" }, { status: 400 })

  return withVenueAction(venueId, "event-shifts assign", async (token, xvmApiVenueId) => {
    await assignEventShift(token, xvmApiVenueId, eventShiftId, parsed.data.membershipId)
    return NextResponse.json({ success: true }, { status: 201 })
  })
}
