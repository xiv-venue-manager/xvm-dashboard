import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createLevelingTier } from "@/lib/api/xvm-api"
import { requireRoleInGuild } from "@/lib/api/venue-guild"
import { tierCreateSchema } from "@/lib/leveling"

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
    const lookup = await requireMyVenue(session.user.id, venueId, "[leveling] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof tierCreateSchema>
    try {
      data = tierCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (data.discordRoleId) {
      const role = await requireRoleInGuild(session.user.id, venueId, data.discordRoleId)
      if (!role.ok) return role.response
    }

    try {
      return NextResponse.json(
        await createLevelingTier(token, lookup.venue.id, {
          name: data.name,
          min_level: data.minLevel,
          ...(data.color !== undefined && { color: data.color }),
          ...(data.icon !== undefined && { icon: data.icon }),
          ...(data.discordRoleId !== undefined && { discord_role_id: data.discordRoleId }),
        }),
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[leveling/tiers] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
