import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listRaffleEntries } from "@/lib/api/xvm-api"
import { resolveEntryNames } from "@/lib/api/resolve-entry-names"

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
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

    try {
      const entries = await listRaffleEntries(token, lookup.venue.id, id)
      const resolved = await resolveEntryNames(entries)
      return NextResponse.json(resolved)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
