import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { eventVisibilityFor } from "@/lib/event-visibility"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createEvent, createEventSeries, listEvents } from "@/lib/api/xvm-api"
import { toDashboardEventShape, toSeriesCreateData } from "@/lib/api/event-shape"

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
  .transform((value) => new Date(value))

const eventSchema = z.object({
  title: validators.eventTitle,
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  startTime: isoDate,
  endTime: isoDate,
  timezone: z.string().optional(),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
})

const LIST_WINDOW_DAYS = 30

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { xvmApiVenueId: true, settings: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { venue, xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
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

    let data: z.infer<typeof eventSchema>
    try {
      data = eventSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const base = {
      title: data.title,
      description: data.description ?? null,
      event_type: data.eventType,
      publish: data.status === "PUBLISHED",
    }

    try {
      const event = data.recurrenceRule
        ? (
            await createEventSeries(
              token,
              gate.xvmApiVenueId,
              toSeriesCreateData(base, data.recurrenceRule, data.startTime, data.endTime)
            )
          ).seed
        : await createEvent(token, gate.xvmApiVenueId, {
            ...base,
            starts_at: data.startTime.toISOString(),
            ends_at: data.endTime.toISOString(),
          })
      return NextResponse.json(toDashboardEventShape(event), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[events] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
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

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const now = new Date()
    const from = startDate ? new Date(startDate) : new Date(now.getTime() - LIST_WINDOW_DAYS * 86400000)
    const to = endDate ? new Date(endDate) : new Date(now.getTime() + LIST_WINDOW_DAYS * 86400000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
    }

    try {
      const items = await listEvents(token, gate.xvmApiVenueId, {
        from: from.toISOString(),
        to: to.toISOString(),
        includeCancelled: true,
      })
      let events = items.map((item) => toDashboardEventShape(item, { now }))
      if (status) {
        events = events.filter((event) => event.status === status)
      }
      if (membership.role === "STAFF" && (await eventVisibilityFor(session.user.id, gate.venue)) === "published") {
        events = events.filter((event) => event.status !== "DRAFT")
      }
      return NextResponse.json(events)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[events] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
