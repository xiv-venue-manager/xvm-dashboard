import { NextResponse } from "next/server"
import { z } from "zod"
import { cancelEventShift } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

const bodySchema = z.object({ reason: z.string().trim().max(200).nullable().optional() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ venueId: string; eventShiftId: string }> }
) {
  const { venueId, eventShiftId: shiftParam } = await params
  const eventShiftId = parseId(shiftParam)
  if (eventShiftId === null) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

  return withVenueAction(venueId, "event-shifts cancel", async (token, xvmApiVenueId) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: "Reason too long (max 200 characters)" }, { status: 400 })
    await cancelEventShift(token, xvmApiVenueId, eventShiftId, parsed.data.reason || null)
    return NextResponse.json({ success: true })
  })
}
