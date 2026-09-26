import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { eventHiddenFromStaff } from "@/lib/event-visibility"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  cancelEvent,
  deleteEvent,
  getEvent,
  listMemberships,
  publishEvent,
  updateEvent,
  type EventRow,
  type EventUpdateData,
} from "@/lib/api/xvm-api"
import { deriveEventStatus } from "@/lib/api/event-status"
import { planStatusChange, toDashboardEventShape } from "@/lib/api/event-shape"

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
  .transform((value) => new Date(value))

const eventUpdateSchema = z.object({
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: isoDate.optional(),
  endTime: isoDate.optional(),
})

type RouteContext = { params: Promise<{ venueId: string; eventId: string }> }

async function authorize(context: RouteContext | undefined) {
  if (!context?.params) {
    return { error: NextResponse.json({ error: "Invalid request" }, { status: 400 }) }
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }

  const { venueId, eventId } = await context.params

  if (!/^\d+$/.test(eventId)) {
    return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) }
  }

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

  return {
    userId: session.user.id,
    token,
    venueId,
    venue,
    xvmApiVenueId: venue.xvmApiVenueId,
    eventId: Number(eventId),
  }
}

async function creatorNameOf(token: string, xvmApiVenueId: string, event: EventRow): Promise<string | null> {
  if (event.created_by_person_id === null) return null
  try {
    const memberships = await listMemberships(token, xvmApiVenueId)
    return memberships.find((m) => m.person.id === event.created_by_person_id)?.person.display_name ?? null
  } catch (err) {
    console.error("[events] creator lookup error:", err)
    return null
  }
}

export const GET = withRateLimit<RouteContext>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId: auth.venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    try {
      const event = await getEvent(auth.token, auth.xvmApiVenueId, auth.eventId)
      const shape = toDashboardEventShape(event, {
        creatorName: await creatorNameOf(auth.token, auth.xvmApiVenueId, event),
      })
      const shownStatus = shape.status === "DRAFT" ? "DRAFT" : "PUBLISHED"
      if (await eventHiddenFromStaff(auth.userId, membership.role, auth.venue, shownStatus)) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }
      return NextResponse.json(shape)
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[events] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<RouteContext>(
  async (request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    let data: z.infer<typeof eventUpdateSchema>
    try {
      data = eventUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const fields: EventUpdateData = {}
    if (data.title !== undefined) fields.title = data.title
    if (data.description !== undefined) fields.description = data.description
    if (data.eventType !== undefined) fields.event_type = data.eventType
    if (data.startTime !== undefined) fields.starts_at = data.startTime.toISOString()
    if (data.endTime !== undefined) fields.ends_at = data.endTime.toISOString()

    try {
      let event = await getEvent(auth.token, auth.xvmApiVenueId, auth.eventId)
      const change = planStatusChange(deriveEventStatus(event), data.status)
      if (change.action === "reject") {
        return NextResponse.json({ error: change.message }, { status: 400 })
      }

      if (Object.keys(fields).length > 0) {
        event = await updateEvent(auth.token, auth.xvmApiVenueId, auth.eventId, fields)
      }
      if (change.action === "publish") {
        event = await publishEvent(auth.token, auth.xvmApiVenueId, auth.eventId)
      } else if (change.action === "cancel") {
        event = await cancelEvent(auth.token, auth.xvmApiVenueId, auth.eventId, { reason: null })
      }
      return NextResponse.json(toDashboardEventShape(event))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[events] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const PATCH = PUT

export const DELETE = withRateLimit<RouteContext>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    try {
      await deleteEvent(auth.token, auth.xvmApiVenueId, auth.eventId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[events] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
