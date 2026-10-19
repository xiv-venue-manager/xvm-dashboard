import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getPanel, updatePanel, deletePanel } from "@/lib/api/xvm-api"

const updatePanelSchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  description: z.string().trim().max(4096).nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  messageType: z.enum(["normal", "unique", "verify"]).optional(),
})

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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const panel = await getPanel(token, lookup.venue.id, id)
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updatePanelSchema>
    try {
      data = updatePanelSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const panel = await updatePanel(token, lookup.venue.id, id, {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.messageType !== undefined && { message_type: data.messageType }),
      })
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deletePanel(token, lookup.venue.id, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
