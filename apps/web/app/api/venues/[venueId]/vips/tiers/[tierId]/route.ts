import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteVipTier, listVipTiers, updateVipTier } from "@/lib/api/xvm-api"
import { requireRoleInGuild } from "@/lib/api/venue-guild"
import { tierUpdateSchema } from "@/lib/vips"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; tierId: string }> }>(
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

    const { venueId, tierId } = await context.params
    const tierNum = parseId(tierId)
    if (tierNum === null) {
      return NextResponse.json({ error: "Invalid tier id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof tierUpdateSchema>
    try {
      data = tierUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (data.discordRoleId) {
      let current: string | null = null
      try {
        current =
          (await listVipTiers(token, lookup.venue.id)).find((tier) => tier.id === tierNum)?.discord_role_id ?? null
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[vips/tiers/:id] PATCH error")
      }
      const role = await requireRoleInGuild(session.user.id, venueId, data.discordRoleId, current)
      if (!role.ok) return role.response
    }

    try {
      return NextResponse.json(
        await updateVipTier(token, lookup.venue.id, tierNum, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.cost !== undefined && { cost: data.cost }),
          ...(data.color !== undefined && { color: data.color }),
          ...(data.discordRoleId !== undefined && { discord_role_id: data.discordRoleId }),
          ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
        })
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/tiers/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; tierId: string }> }>(
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

    const { venueId, tierId } = await context.params
    const tierNum = parseId(tierId)
    if (tierNum === null) {
      return NextResponse.json({ error: "Invalid tier id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[vips] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteVipTier(token, lookup.venue.id, tierNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[vips/tiers/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
