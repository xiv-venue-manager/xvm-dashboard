import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { validators } from "@/lib/validation"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { banPatronByName } from "@/lib/api/xvm-api"

const banByNameSchema = z.object({
  characterName: validators.characterName,
  world: validators.world,
  reason: z.string().trim().min(1, "Reason is required").max(500, "Reason too long (max 500 characters)"),
})

export const POST = withRateLimit<{
  params: Promise<{ venueId: string }>
}>(
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
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    let data: z.infer<typeof banByNameSchema>
    try {
      data = banByNameSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const patron = await banPatronByName(token, venue.xvmApiVenueId, data.characterName, data.world, data.reason)
      return NextResponse.json({ id: patron.id, isBanned: patron.is_banned })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[patrons/bans] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
