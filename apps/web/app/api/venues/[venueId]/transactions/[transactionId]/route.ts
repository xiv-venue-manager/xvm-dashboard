import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { updateFinanceTransaction, voidFinanceTransaction } from "@/lib/api/xvm-api"
import { gilToMinorUnits } from "@/lib/api/position-convert"

// serviceId/eventId dropped: re-pointing a posted transaction's service/event
// after the fact isn't scoped by this cutover.
const updateTransactionSchema = z.object({
  amount: validators.amount.optional(),
  customerName: validators.customerName.optional(),
  notes: validators.transactionNotes.optional(),
})

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
    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[transactions/[transactionId]] /me/venues read error")
    if (!lookup.ok) return lookup.response

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
      const transaction = await updateFinanceTransaction(token, lookup.venue.id, Number(transactionId), {
        amount: validatedData.amount !== undefined ? (gilToMinorUnits(validatedData.amount) ?? undefined) : undefined,
        customer_name: validatedData.customerName,
        notes: validatedData.notes,
      })

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
    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[transactions/[transactionId]] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await voidFinanceTransaction(token, lookup.venue.id, Number(transactionId), {
        reason: "Deleted via dashboard",
      })

      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[transactions/:id] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
