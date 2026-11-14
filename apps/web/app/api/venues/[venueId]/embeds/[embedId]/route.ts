import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteEmbed, updateEmbed } from "@/lib/api/xvm-api"
import { bodyToApi, embedBodySchema } from "@/lib/embed-draft"

function parseEmbedId(embedId: string) {
  const id = Number(embedId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; embedId: string }> }>(
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

    let data: z.infer<typeof embedBodySchema>
    try {
      data = embedBodySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await updateEmbed(token, lookup.venue.id, id, bodyToApi(data)))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[embeds/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; embedId: string }> }>(
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
      await deleteEmbed(token, lookup.venue.id, id)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[embeds/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
