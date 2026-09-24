import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { eventHiddenFromStaff } from "@/lib/event-visibility"

const eventUpdateSchema = z.object({
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  endTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  timezone: z.string().optional(),
  attendanceCount: z.number().optional(),
  revenue: z.number().optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId, eventId } = await params

      // Check access
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }

      const event = await prisma.event.findUnique({
        where: { id: eventId, venueId },
        include: {
          createdBy: {
            select: {
              name: true,
              image: true,
            },
          },
        },
      })

      if (!event) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }

      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true, xvmApiVenueId: true },
      })
      if (await eventHiddenFromStaff(session.user.id, membership.role, venue, event.status)) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 })
      }

      return NextResponse.json(event)
    } catch (error) {
      console.error("Error fetching event:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId, eventId } = await params

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json({ error: "You don't have permission to edit events" }, { status: 403 })
      }

      const body = await request.json()
      const validatedData = eventUpdateSchema.parse(body)

      // If marking event as COMPLETED, auto-calculate attendance and revenue
      if (validatedData.status === "COMPLETED") {
        // Calculate final patron count from logs
        const patronLogs = await prisma.patronLog.findMany({
          where: { eventId },
          select: { countChange: true },
        })
        const finalPatronCount = patronLogs.reduce((sum, log) => sum + (log.countChange ?? 0), 0)

        // Calculate total revenue from transactions
        const transactions = await prisma.transaction.findMany({
          where: { eventId },
          select: { amount: true },
        })
        const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)

        // Only set if not manually provided
        if (validatedData.attendanceCount === undefined && finalPatronCount > 0) {
          validatedData.attendanceCount = Math.max(0, finalPatronCount)
        }
        if (validatedData.revenue === undefined && totalRevenue > 0) {
          validatedData.revenue = totalRevenue
        }
      }

      const event = await prisma.event.update({
        where: { id: eventId, venueId },
        data: validatedData,
      })

      return NextResponse.json(event)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error updating event:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const PATCH = PUT

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId, eventId } = await params

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json({ error: "You don't have permission to delete events" }, { status: 403 })
      }

      await prisma.event.delete({
        where: { id: eventId, venueId },
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting event:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
