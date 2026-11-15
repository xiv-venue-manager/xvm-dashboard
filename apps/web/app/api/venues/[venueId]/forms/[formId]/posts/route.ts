import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listFormPosts, postForm } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { postSchema } from "@/lib/forms"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    const { venueId, formId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      return NextResponse.json(await listFormPosts(token, lookup.venue.id, formNum))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/posts] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    const { venueId, formId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
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
      // 202, no body: the bot does the work.
      await postForm(token, lookup.venue.id, formNum, { channel_id: data.channelId })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/posts] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
