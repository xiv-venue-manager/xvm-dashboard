import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listEventTemplates, createEventTemplate } from "@/lib/api/xvm-api"
import { HHMM_PATTERN, minutesOfDay, toDashboardTemplateShape } from "@/lib/api/event-template-shape"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(100, "Template name too long (max 100 characters)"),
  title: validators.eventTitle,
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  // Accepted for backward compatibility with the existing form (always "UTC" today,
  // no UI control sends anything else) - xvm-api's templates have no timezone field,
  // so this is parsed and silently dropped, not persisted anywhere.
  timezone: z.string().optional(),
  defaultStartTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").default("19:00"),
  defaultEndTime: z.string().regex(HHMM_PATTERN, "Invalid time format. Use HH:MM").default("22:00"),
})

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

// GET - List all event templates for a venue
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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const templates = await listEventTemplates(token, gate.xvmApiVenueId!)
      return NextResponse.json(templates.map(toDashboardTemplateShape))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[event-templates] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

// POST - Create a new event template
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

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createTemplateSchema>
    try {
      data = createTemplateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const startMinute = minutesOfDay(data.defaultStartTime)
    let durationMinutes = minutesOfDay(data.defaultEndTime) - startMinute
    // <= (not <) is deliberate: identical start/end times mean the event runs
    // a full 24h, not zero-length.
    if (durationMinutes <= 0) durationMinutes += 24 * 60 // end time past midnight

    try {
      const template = await createEventTemplate(token, gate.xvmApiVenueId!, {
        name: data.name,
        title: data.title,
        description: data.description ?? null,
        event_type: data.eventType,
        default_start_minute_of_day: startMinute,
        default_duration_minutes: durationMinutes,
      })
      return NextResponse.json(toDashboardTemplateShape(template), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[event-templates] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
