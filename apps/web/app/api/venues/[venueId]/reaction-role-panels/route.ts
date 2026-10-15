import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listPanels, createPanel } from "@/lib/api/xvm-api"

const createPanelSchema = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().max(4096).nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  messageType: z.enum(["normal", "unique", "verify"]).optional(),
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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const panels = await listPanels(token, lookup.venue.id)
      return NextResponse.json(panels)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels] GET error")
    }
  },
  { requests: 30, window: "1 m" }
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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof createPanelSchema>
    try {
      data = createPanelSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const panel = await createPanel(token, lookup.venue.id, {
        title: data.title,
        description: data.description ?? null,
        color: data.color ?? null,
        message_type: data.messageType,
      })
      return NextResponse.json(panel, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
