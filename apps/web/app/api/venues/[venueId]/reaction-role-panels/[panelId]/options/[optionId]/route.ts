import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { updatePanelOption, deletePanelOption } from "@/lib/api/xvm-api"

const updateOptionSchema = z
  .object({
    label: z.string().trim().min(1).max(80).nullable().optional(),
    emoji: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((data) => !(data.label === null && data.emoji === null), {
    message: "A button needs a label or an emoji — can't clear both at once.",
  })

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; panelId: string; optionId: string }> }>(
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

    const { venueId, panelId, optionId } = await context.params
    const pId = parseId(panelId)
    const oId = parseId(optionId)
    if (pId === null || oId === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updateOptionSchema>
    try {
      data = updateOptionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await updatePanelOption(token, lookup.venue.id, pId, oId, {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.emoji !== undefined && { emoji: data.emoji }),
      })
      return NextResponse.json(option)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; panelId: string; optionId: string }> }>(
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

    const { venueId, panelId, optionId } = await context.params
    const pId = parseId(panelId)
    const oId = parseId(optionId)
    if (pId === null || oId === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[reaction-role-panels] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deletePanelOption(token, lookup.venue.id, pId, oId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
