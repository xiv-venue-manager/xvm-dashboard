import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { creditTickets, refundTickets } from "@/lib/api/xvm-api"

const creditSchema = z.object({
  quantity: z.number().int().min(1).max(10_000).optional(),
})

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

function isValidDiscordUserId(discordUserId: string) {
  return /^\d{15,25}$/.test(discordUserId)
}

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string; discordUserId: string }> }>(
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

    const { venueId, raffleId, discordUserId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    if (!isValidDiscordUserId(discordUserId)) {
      return NextResponse.json({ error: "Invalid discord user id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let parsed: z.infer<typeof creditSchema>
    try {
      parsed = creditSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const entry = await creditTickets(token, lookup.venue.id, id, discordUserId, { quantity: parsed.quantity })
      return NextResponse.json(entry)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries/:discordUserId] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string; discordUserId: string }> }>(
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

    const { venueId, raffleId, discordUserId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    if (!isValidDiscordUserId(discordUserId)) {
      return NextResponse.json({ error: "Invalid discord user id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await refundTickets(token, lookup.venue.id, id, discordUserId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries/:discordUserId] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
