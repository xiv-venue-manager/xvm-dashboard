import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { rollGiveaway } from "@/lib/api/xvm-api"

function parseGiveawayId(giveawayId: string) {
  const id = Number(giveawayId)
  return Number.isInteger(id) ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
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

    const { venueId, giveawayId } = await context.params
    const id = parseGiveawayId(giveawayId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid giveaway id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const result = await rollGiveaway(token, lookup.venue.id, id)
      return NextResponse.json(result)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id/roll] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
