import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listLevelingAwards } from "@/lib/api/xvm-api"

export const GET = withRateLimit<{ params: Promise<{ venueId: string; personId: string }> }>(
  async (_request, context) => {
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

    const { venueId, personId } = await context.params
    const id = Number(personId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid person id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[leveling] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listLevelingAwards(token, lookup.venue.id, id))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[leveling/members/:id/awards] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
