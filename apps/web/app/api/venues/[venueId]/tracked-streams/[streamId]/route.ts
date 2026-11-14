import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteTrackedStream, updateTrackedStream } from "@/lib/api/xvm-api"
import { requireChannelInGuild, requireRoleInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const updateStreamSchema = z.object({
  channelId: validators.snowflake.optional(),
  roleId: validators.snowflake.nullable().optional(),
})

function parseStreamId(streamId: string) {
  const id = Number(streamId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; streamId: string }> }>(
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

    const { venueId, streamId } = await context.params
    const id = parseStreamId(streamId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid stream id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tracked-streams] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updateStreamSchema>
    try {
      data = updateStreamSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (data.channelId) {
      const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
      if (!channel.ok) return channel.response
    }
    if (data.roleId) {
      const role = await requireRoleInGuild(session.user.id, venueId, data.roleId)
      if (!role.ok) return role.response
    }

    try {
      const stream = await updateTrackedStream(token, lookup.venue.id, id, {
        ...(data.channelId !== undefined && { channel_id: data.channelId }),
        ...(data.roleId !== undefined && { role_id: data.roleId }),
      })
      return NextResponse.json(stream)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tracked-streams/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; streamId: string }> }>(
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

    const { venueId, streamId } = await context.params
    const id = parseStreamId(streamId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid stream id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tracked-streams] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteTrackedStream(token, lookup.venue.id, id)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tracked-streams/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
