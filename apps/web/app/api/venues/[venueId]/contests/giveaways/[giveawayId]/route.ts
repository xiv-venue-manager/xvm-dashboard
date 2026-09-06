import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateGiveaway, deleteGiveaway } from "@/lib/api/xvm-api"

const updateGiveawaySchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  prize: z.string().trim().max(500).nullable().optional(),
  thumbnailUrl: z.string().trim().nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  emoji: z.string().trim().max(100).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  numWinners: z.number().int().min(1).max(50).nullable().optional(),
  autoNotify: z.boolean().nullable().optional(),
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

function parseGiveawayId(giveawayId: string) {
  const id = Number(giveawayId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let parsed: z.infer<typeof updateGiveawaySchema>
    try {
      parsed = updateGiveawaySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const giveaway = await updateGiveaway(token, gate.xvmApiVenueId!, id, {
        name: parsed.name,
        description: parsed.description,
        prize: parsed.prize,
        thumbnail_url: parsed.thumbnailUrl,
        color: parsed.color,
        emoji: parsed.emoji,
        end_at: parsed.endAt,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(giveaway)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteGiveaway(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
