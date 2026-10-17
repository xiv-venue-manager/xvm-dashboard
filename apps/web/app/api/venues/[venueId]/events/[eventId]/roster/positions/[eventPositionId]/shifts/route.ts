import { NextResponse } from "next/server"
import { z } from "zod"
import { addEventShift } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().min(1),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ venueId: string; eventId: string; eventPositionId: string }> }
) {
  const { venueId, eventId: eventIdParam, eventPositionId: positionParam } = await params
  const eventId = parseId(eventIdParam)
  const eventPositionId = parseId(positionParam)
  if (eventId === null || eventPositionId === null) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
  }

  return withVenueAction(venueId, "roster shifts POST", async (token, xvmApiVenueId) => {
    await addEventShift(token, xvmApiVenueId, eventId, eventPositionId, {
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      capacity: parsed.data.capacity,
    })
    return NextResponse.json({ success: true }, { status: 201 })
  })
}
