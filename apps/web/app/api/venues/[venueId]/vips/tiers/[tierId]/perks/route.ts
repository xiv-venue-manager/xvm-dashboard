import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createVipPerk } from "@/lib/api/xvm-api"
import { perkCreateSchema } from "@/lib/vips"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; tierId: string }> }>(
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

    const { venueId, tierId } = await context.params
    const tierNum = parseId(tierId)
    if (tierNum === null) {
      return NextResponse.json({ error: "Invalid tier id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof perkCreateSchema>
    try {
      data = perkCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await createVipPerk(token, lookup.venue.id, tierNum, {
          name: data.name,
          ...(data.description !== undefined && { description: data.description }),
          ...(data.repeatability !== undefined && { repeatability: data.repeatability }),
          ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
        }),
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/tiers/:id/perks] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
