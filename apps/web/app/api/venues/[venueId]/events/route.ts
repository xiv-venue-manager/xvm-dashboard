import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { generateOccurrences, type RecurrenceRule } from "@/lib/recurrence"
import { validators } from "@/lib/validation"
import { canManageVenue } from "@/lib/roles"
import { Prisma, type EventStatus } from "@/generated/prisma/client"
import { eventVisibilityFor } from "@/lib/event-visibility"

const eventSchema = z.object({
  title: validators.eventTitle,
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)),
  timezone: z.string().default("UTC"),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
})

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await params

      // Check if user has permission to create events in this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership || !canManageVenue(membership.role)) {
        return NextResponse.json({ error: "You don't have permission to create events" }, { status: 403 })
      }

      const body = await request.json()
      const validatedData = eventSchema.parse(body)
      const { recurrenceRule, ...eventData } = validatedData

      const event = await prisma.event.create({
        data: {
          ...eventData,
          recurrenceRule: recurrenceRule ?? null,
          venueId,
          createdById: session.user.id,
        },
      })

      if (recurrenceRule) {
        const occurrences = generateOccurrences(event.startTime, event.endTime, recurrenceRule as RecurrenceRule, 8)
        await prisma.event.createMany({
          data: occurrences.map((o) => ({
            title: event.title,
            description: event.description,
            eventType: event.eventType,
            status: event.status,
            timezone: event.timezone,
            venueId,
            createdById: session.user.id,
            parentEventId: event.id,
            startTime: o.startTime,
            endTime: o.endTime,
          })),
        })
      }

      return NextResponse.json(event, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error creating event:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await params

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true, xvmApiVenueId: true },
      })

      // Get query parameters for filtering
      const searchParams = request.nextUrl.searchParams
      const status = searchParams.get("status")
      const startDate = searchParams.get("startDate")
      const endDate = searchParams.get("endDate")

      const where: Prisma.EventWhereInput = { venueId }

      if (status) {
        where.status = status as EventStatus
      }

      if (membership.role === "STAFF" && (await eventVisibilityFor(session.user.id, venue)) === "published") {
        where.status = "PUBLISHED"
      }

      if (startDate && endDate) {
        where.startTime = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        }
      }

      const events = await prisma.event.findMany({
        where,
        include: {
          createdBy: {
            select: {
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      })

      return NextResponse.json(events)
    } catch (error) {
      console.error("Error fetching events:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
