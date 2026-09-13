import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { createTransaction, createTransactionSchema, InsufficientStockError } from "@/lib/api/transactions"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listFinanceTransactions } from "@/lib/api/xvm-api"

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

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { params } = context
    const { venueId } = await params
    const { searchParams } = new URL(request.url)
    // eventId, cursor and limit are accepted but no longer meaningful:
    // xvm-api's finance transactions endpoint takes a from/to window, not a
    // Prisma-style cursor, and eventId filtering has no cuid<->int bridge
    // yet (same gap documented in lib/api/transactions.ts's createTransaction).
    const serviceId = searchParams.get("serviceId")
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    // Validate dates if provided
    let startDate: Date | undefined
    let endDate: Date | undefined

    if (startDateParam) {
      const parsed = Date.parse(startDateParam)
      if (isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid start date format" }, { status: 400 })
      }
      startDate = new Date(parsed)
    }

    if (endDateParam) {
      const parsed = Date.parse(endDateParam)
      if (isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid end date format" }, { status: 400 })
      }
      endDate = new Date(parsed)
    }

    // Ensure start date is before end date
    if (startDate && endDate && startDate >= endDate) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
    }

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

    // Get venue settings
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    })

    const venueSettings = venue?.settings as Record<string, unknown> | undefined

    // Check sales visibility for STAFF members
    if (membership.role === "STAFF" && venueSettings?.salesVisibility) {
      const salesVisibility = venueSettings.salesVisibility

      if (salesVisibility === "none") {
        // Staff have no access to sales page at all
        return NextResponse.json({ error: "You don't have permission to view sales data" }, { status: 403 })
      }
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const from = startDate?.toISOString() ?? new Date(0).toISOString()
      const to = endDate?.toISOString() ?? new Date().toISOString()
      let transactions = await listFinanceTransactions(token, gate.xvmApiVenueId!, {
        from,
        to,
        serviceId: serviceId ? Number(serviceId) : undefined,
      })

      // "own" sales visibility restricts STAFF to transactions they
      // personally recorded. xvm-api's list endpoint has no
      // recorded_by_person_id query param, so this is filtered client-side
      // against the caller's own xvm-api person id.
      if (membership.role === "STAFF" && venueSettings?.salesVisibility === "own") {
        const personId = await getValidXvmApiPersonId(session.user.id)
        transactions = transactions.filter((t) => t.recorded_by_person_id === personId)
      }

      return NextResponse.json({ transactions, nextCursor: null, hasMore: false })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[transactions] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

      const body = await request.json()
      const validatedData = createTransactionSchema.parse(body)

      // Delegate row creation, webhook dispatch, and cache invalidation to
      // the shared helper. The plugin route (/api/plugin/transactions) uses
      // the exact same helper with an api-key-derived userId, so the two
      // surfaces are guaranteed to produce identical side effects.
      const newTransaction = await createTransaction(venueId, session.user.id, validatedData)

      return NextResponse.json(newTransaction, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      if (error instanceof InsufficientStockError) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }

      console.error("Error creating transaction:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)
