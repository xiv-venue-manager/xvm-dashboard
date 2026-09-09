import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updatePayrollEntry, deletePayrollEntry, type PayrollEntryRow } from "@/lib/api/xvm-api"
import { minorUnitsToDollars, minutesToHours } from "@/lib/api/position-convert"

const patchSchema = z
  .object({
    isPaid: z.boolean().optional(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()

function toDashboardEntry(row: PayrollEntryRow) {
  return {
    id: row.id,
    membershipId: row.membership_id,
    paymentType: row.payment_type === "fixed_salary" ? "FIXED_SALARY" : row.payment_type === "hourly" ? "HOURLY" : "POT_SHARE",
    baseRate: minorUnitsToDollars(row.base_rate_minor),
    hoursWorked: minutesToHours(row.minutes_worked),
    bonusAmount: row.bonus_amount_minor !== null ? minorUnitsToDollars(row.bonus_amount_minor) : null,
    totalAmount: minorUnitsToDollars(row.total_amount_minor),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    isPaid: row.is_paid,
    paidAt: row.paid_at,
    potDistributionId: row.pot_distribution_id,
    notes: row.notes,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
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

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId, payrollId } = await context.params
    const entryId = Number(payrollId)
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid payroll entry id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof patchSchema>
    try {
      data = patchSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const row = await updatePayrollEntry(token, gate.xvmApiVenueId!, entryId, {
        is_paid: data.isPaid,
        notes: data.notes,
      })
      return NextResponse.json(toDashboardEntry(row))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId, payrollId } = await context.params
    const entryId = Number(payrollId)
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid payroll entry id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deletePayrollEntry(token, gate.xvmApiVenueId!, entryId)
      return NextResponse.json({ success: true, message: "Payroll entry deleted" })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
