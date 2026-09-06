import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listRaffleEntries } from "@/lib/api/xvm-api"
import { resolveEntryNames } from "@/lib/api/resolve-entry-names"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const entries = await listRaffleEntries(token, gate.xvmApiVenueId!, id)
      const resolved = await resolveEntryNames(entries)
      return NextResponse.json(resolved)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
