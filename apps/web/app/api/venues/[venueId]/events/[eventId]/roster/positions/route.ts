import { NextResponse } from "next/server"
import { z } from "zod"
import { addEventPosition } from "@/lib/api/xvm-api"
import { parseId, withVenueAction } from "@/lib/api/venue-action"

const bodySchema = z.object({ positionId: z.number().int() })

export async function POST(request: Request, { params }: { params: Promise<{ venueId: string; eventId: string }> }) {
  const { venueId, eventId: eventIdParam } = await params
  const eventId = parseId(eventIdParam)
  if (eventId === null) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  return withVenueAction(venueId, "roster positions POST", async (token, xvmApiVenueId) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Choose a position" }, { status: 400 })
    await addEventPosition(token, xvmApiVenueId, eventId, parsed.data.positionId)
    return NextResponse.json({ success: true }, { status: 201 })
  })
}
