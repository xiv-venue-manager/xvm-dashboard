import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listRooms, createRoom } from "@/lib/api/xvm-api"

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  roomNumber: z.number().int().min(1).max(999).optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[rooms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const rooms = await listRooms(token, lookup.venue.id)
      return NextResponse.json(rooms)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[rooms] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[rooms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let input: z.infer<typeof createRoomSchema>
    try {
      input = createRoomSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const room = await createRoom(token, lookup.venue.id, {
        name: input.name,
        ...(input.roomNumber !== undefined && { room_number: input.roomNumber }),
      })
      return NextResponse.json(room)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[rooms] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
