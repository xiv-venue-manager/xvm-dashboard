import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createTrackedStream, listTrackedStreams } from "@/lib/api/xvm-api"
import { requireChannelInGuild, requireRoleInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const createStreamSchema = z.object({
  twitchUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{4,25}$/),
  channelId: validators.snowflake,
  roleId: validators.snowflake.nullable().optional(),
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[tracked-streams] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listTrackedStreams(token, lookup.venue.id))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tracked-streams] GET error")
    }
  },
  { requests: 60, window: "1 m" }
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[tracked-streams] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof createStreamSchema>
    try {
      data = createStreamSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
    if (!channel.ok) return channel.response
    if (data.roleId) {
      const role = await requireRoleInGuild(session.user.id, venueId, data.roleId)
      if (!role.ok) return role.response
    }

    try {
      const stream = await createTrackedStream(token, lookup.venue.id, {
        twitch_username: data.twitchUsername,
        channel_id: data.channelId,
        ...(data.roleId !== undefined && { role_id: data.roleId }),
      })
      return NextResponse.json(stream, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tracked-streams] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
