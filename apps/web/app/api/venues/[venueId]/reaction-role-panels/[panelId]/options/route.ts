import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { addPanelOption } from "@/lib/api/xvm-api"
import { validators } from "@/lib/validation"

const addOptionSchema = z
  .object({
    roleId: validators.snowflake,
    label: z.string().trim().min(1).max(80).nullable().optional(),
    emoji: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((data) => data.label || data.emoji, { message: "A button needs a label or an emoji." })

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

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

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof addOptionSchema>
    try {
      data = addOptionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await addPanelOption(token, lookup.venue.id, id, {
        role_id: data.roleId,
        label: data.label ?? null,
        emoji: data.emoji ?? null,
      })
      return NextResponse.json(option, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
