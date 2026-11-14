import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listEmbedPosts, postEmbed } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const postSchema = z.object({ channelId: validators.snowflake })

function parseEmbedId(embedId: string) {
  const id = Number(embedId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; embedId: string }> }>(
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

    const { venueId, embedId } = await context.params
    const id = parseEmbedId(embedId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid embed id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[embeds] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listEmbedPosts(token, lookup.venue.id, id))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[embeds/:id/posts] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; embedId: string }> }>(
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

    const { venueId, embedId } = await context.params
    const id = parseEmbedId(embedId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid embed id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[embeds] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof postSchema>
    try {
      data = postSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const channel = await requireChannelInGuild(session.user.id, venueId, data.channelId)
    if (!channel.ok) return channel.response

    try {
      await postEmbed(token, lookup.venue.id, id, data.channelId)
      return new NextResponse(null, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[embeds/:id/posts] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
