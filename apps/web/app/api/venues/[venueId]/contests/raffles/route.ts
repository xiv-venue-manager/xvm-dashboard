import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listRaffles, createRaffle } from "@/lib/api/xvm-api"

const createRaffleSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  costPerTicket: z.number().int().min(1).max(999_999_999_999).optional(),
  winnerBasisPoints: z.number().int().min(0).max(10_000).optional(),
  numWinners: z.number().int().min(1).max(50).optional(),
  autoNotify: z.boolean().optional(),
})

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
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const includeRolled = new URL(request.url).searchParams.get("include_rolled") === "true"

    try {
      const raffles = await listRaffles(token, gate.xvmApiVenueId!, { includeRolled })
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
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

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
      const raffle = await createRaffle(token, gate.xvmApiVenueId!, {
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
