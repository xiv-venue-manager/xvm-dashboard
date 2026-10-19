import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listRaffles, createRaffle } from "@/lib/api/xvm-api"

const createRaffleSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  costPerTicket: z.number().int().min(1).max(999_999_999_999).optional(),
  winnerBasisPoints: z.number().int().min(0).max(10_000).optional(),
  numWinners: z.number().int().min(1).max(50).optional(),
  autoNotify: z.boolean().optional(),
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const includeRolled = new URL(request.url).searchParams.get("include_rolled") === "true"

    try {
      const raffles = await listRaffles(token, lookup.venue.id, { includeRolled })
      return NextResponse.json(raffles)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles] GET error")
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[contests] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let parsed: z.infer<typeof createRaffleSchema>
    try {
      parsed = createRaffleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const raffle = await createRaffle(token, lookup.venue.id, {
        name: parsed.name,
        cost_per_ticket: parsed.costPerTicket,
        winner_basis_points: parsed.winnerBasisPoints,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(raffle)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
