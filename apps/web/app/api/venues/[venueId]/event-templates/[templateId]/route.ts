import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateEventTemplate, deleteEventTemplate, type EventTemplateRow } from "@/lib/api/xvm-api"

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100, "Template name too long (max 100 characters)").optional(),
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  timezone: z.string().optional(),
  defaultStartTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").optional(),
  defaultEndTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").optional(),
})

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function hhmmFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function toDashboardShape(t: EventTemplateRow) {
  return {
    id: String(t.id),
    name: t.name,
    title: t.title,
    description: t.description,
    eventType: t.event_type,
    defaultStartTime: hhmmFromMinutes(t.default_start_minute_of_day),
    defaultEndTime: hhmmFromMinutes(t.default_start_minute_of_day + t.default_duration_minutes),
    createdBy: null,
  }
}

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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

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
      if (durationMinutes <= 0) durationMinutes += 24 * 60
    }

    try {
      const template = await updateEventTemplate(token, gate.xvmApiVenueId!, id, {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.eventType !== undefined && { event_type: data.eventType }),
        ...(startMinute !== undefined && { default_start_minute_of_day: startMinute }),
        ...(durationMinutes !== undefined && { default_duration_minutes: durationMinutes }),
      })
      return NextResponse.json(toDashboardShape(template))
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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteEventTemplate(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[event-templates/:id] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
