import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { createTransaction, createTransactionSchema, InsufficientStockError } from "@/lib/api/transactions"
import { withVenueAction } from "@/lib/api/venue-action"
import { listFinanceTransactions } from "@/lib/api/xvm-api"

const DEFAULT_LIST_WINDOW_MS = 59 * 24 * 60 * 60 * 1000

const listKindSchema = z.enum(["sale", "tip", "cover_charge", "other_income", "expense", "payout"]).optional()

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { venueId } = await context.params

    return withVenueAction(venueId, "transactions GET", async (token, xvmApiVenueId) => {
      const { searchParams } = new URL(request.url)
      // eventId, cursor and limit are accepted but no longer meaningful:
      // xvm-api's finance transactions endpoint takes a from/to window, not a
      // Prisma-style cursor, and eventId filtering has no cuid<->int bridge
      // yet (same gap documented in lib/api/transactions.ts's createTransaction).
      const kindParsed = listKindSchema.safeParse(searchParams.get("kind") ?? undefined)
      if (!kindParsed.success) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
      }
      const kind = kindParsed.data
      const startDateParam = searchParams.get("startDate")
      const endDateParam = searchParams.get("endDate")

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

      if (startDate && endDate && startDate >= endDate) {
        return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
      }

      const to = endDate ?? new Date()
      const from = startDate ?? new Date(to.getTime() - DEFAULT_LIST_WINDOW_MS)
      const transactions = await listFinanceTransactions(token, xvmApiVenueId, {
        from: from.toISOString(),
        to: to.toISOString(),
        kind,
      })

      return NextResponse.json({ transactions, nextCursor: null, hasMore: false })
    })
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { venueId } = await context.params

    return withVenueAction(venueId, "transactions POST", async (token, xvmApiVenueId) => {
      const session = await getServerSession(authOptions)

      try {
        const validatedData = createTransactionSchema.parse(await request.json().catch(() => null))
        const newTransaction = await createTransaction(token, xvmApiVenueId, session!.user.id, validatedData)
        return NextResponse.json(newTransaction, { status: 201 })
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        if (error instanceof InsufficientStockError) {
          return NextResponse.json({ error: error.message }, { status: 409 })
        }
        throw error
      }
    })
  },
  { requests: 10, window: "1 m" }
)
