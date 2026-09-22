import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPanelPosts, postPanel } from "@/lib/api/xvm-api"
import { validators } from "@/lib/validation"

const postSchema = z.object({ channelId: validators.snowflake })

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

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
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

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const posts = await listPanelPosts(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(posts)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/posts] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
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

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof postSchema>
    try {
      data = postSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      // 202, no body - the bot does the work. See lib/api/xvm-api.ts's postPanel.
      await postPanel(token, gate.xvmApiVenueId!, id, { channel_id: data.channelId })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/posts] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
