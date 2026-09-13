import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { invalidateCache } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateFinanceTransaction, voidFinanceTransaction } from "@/lib/api/xvm-api"
import { dollarsToMinorUnits } from "@/lib/api/position-convert"

// serviceId/eventId dropped: re-pointing a posted transaction's service/event
// after the fact isn't scoped by this cutover.
const updateTransactionSchema = z.object({
  amount: validators.amount.optional(),
  customerName: validators.customerName.optional(),
  notes: validators.transactionNotes.optional(),
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

// PATCH - Update a transaction
export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; transactionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { params } = context
    const { venueId, transactionId } = await params

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let validatedData: z.infer<typeof updateTransactionSchema>
    try {
      validatedData = updateTransactionSchema.parse(await request.json())
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const transaction = await updateFinanceTransaction(token, gate.xvmApiVenueId!, Number(transactionId), {
        amount: validatedData.amount !== undefined ? (dollarsToMinorUnits(validatedData.amount) ?? undefined) : undefined,
        customer_name: validatedData.customerName,
        notes: validatedData.notes,
      })

      // Invalidate cache for analytics
      await invalidateCache(`venue:${venueId}:analytics`)

      return NextResponse.json(transaction)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[transactions/:id] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

// DELETE - Void a transaction
//
// xvm-api's finance router has no delete endpoint, only POST .../void. A
// "deleted" transaction now survives as a voided row (audit trail) instead
// of disappearing - a real behavior change from the old hard-delete.
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; transactionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { params } = context
    const { venueId, transactionId } = await params

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await voidFinanceTransaction(token, gate.xvmApiVenueId!, Number(transactionId), {
        reason: "Deleted via dashboard",
      })

      // Invalidate cache for analytics
      await invalidateCache(`venue:${venueId}:analytics`)

      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[transactions/:id] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
