import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { postRaffle } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const postSchema = z.object({ channelId: validators.snowflake })

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
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

    const { venueId, raffleId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof postSchema>
    try {
      data = postSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
    if (!channel.ok) return channel.response

    try {
      await postRaffle(token, lookup.venue.id, id, { channel_id: data.channelId })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/posts] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
