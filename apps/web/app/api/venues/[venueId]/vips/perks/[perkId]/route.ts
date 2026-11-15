import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteVipPerk, updateVipPerk } from "@/lib/api/xvm-api"
import { perkUpdateSchema } from "@/lib/vips"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; perkId: string }> }>(
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

    const { venueId, perkId } = await context.params
    const perkNum = parseId(perkId)
    if (perkNum === null) {
      return NextResponse.json({ error: "Invalid perk id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof perkUpdateSchema>
    try {
      data = perkUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await updateVipPerk(token, lookup.venue.id, perkNum, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.repeatability !== undefined && { repeatability: data.repeatability }),
          ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
        })
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/perks/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; perkId: string }> }>(
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

    const { venueId, perkId } = await context.params
    const perkNum = parseId(perkId)
    if (perkNum === null) {
      return NextResponse.json({ error: "Invalid perk id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteVipPerk(token, lookup.venue.id, perkNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/perks/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
