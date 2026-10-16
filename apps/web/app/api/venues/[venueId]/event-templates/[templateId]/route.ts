import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { updateEventTemplate, deleteEventTemplate } from "@/lib/api/xvm-api"
import { HHMM_PATTERN, minutesOfDay, toDashboardTemplateShape } from "@/lib/api/event-template-shape"

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100, "Template name too long (max 100 characters)").optional(),
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  defaultStartTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").optional(),
  defaultEndTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").optional(),
})

function parseTemplateId(templateId: string) {
  const id = Number(templateId)
  return Number.isInteger(id) ? id : null
}

// PATCH - Update an event template
export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; templateId: string }> }>(
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

    const { venueId, templateId } = await context.params
    const id = parseTemplateId(templateId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid template id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[event-templates/[templateId]] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof updateTemplateSchema>
    try {
      data = updateTemplateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // xvm-api stores start-minute + duration, not a start/end pair, so computing
    // a correct new duration needs both values in hand - if only one of the two
    // is being changed, reject rather than guess at the missing half.
    let startMinute: number | undefined
    let durationMinutes: number | undefined
    if (data.defaultStartTime !== undefined || data.defaultEndTime !== undefined) {
      if (data.defaultStartTime === undefined || data.defaultEndTime === undefined) {
        return NextResponse.json(
          { error: "Invalid request", details: "defaultStartTime and defaultEndTime must be updated together" },
          { status: 400 }
        )
      }
      startMinute = minutesOfDay(data.defaultStartTime)
      durationMinutes = minutesOfDay(data.defaultEndTime) - startMinute
      // <= (not <) is deliberate: identical start/end times mean the event
      // runs a full 24h, not zero-length.
      if (durationMinutes <= 0) durationMinutes += 24 * 60
    }

    try {
      const template = await updateEventTemplate(token, lookup.venue.id, id, {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.eventType !== undefined && { event_type: data.eventType }),
        ...(startMinute !== undefined && { default_start_minute_of_day: startMinute }),
        ...(durationMinutes !== undefined && { default_duration_minutes: durationMinutes }),
      })
      return NextResponse.json(toDashboardTemplateShape(template))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[event-templates/:id] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

// DELETE - Delete an event template
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; templateId: string }> }>(
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

    const { venueId, templateId } = await context.params
    const id = parseTemplateId(templateId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid template id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[event-templates/[templateId]] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteEventTemplate(token, lookup.venue.id, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[event-templates/:id] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
