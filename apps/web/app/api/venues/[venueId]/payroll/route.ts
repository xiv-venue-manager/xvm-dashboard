import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPayroll, createPayrollEntry, type PayrollEntryRow } from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes, minutesToHours } from "@/lib/api/position-convert"

const createPayrollSchema = z
  .object({
    membershipId: z.number().int(),
    paymentType: z.enum(["FIXED_SALARY", "HOURLY"]),
    baseRate: z.number().min(0).max(999999999),
    hoursWorked: z.number().min(0).max(9999).optional(),
    bonusAmount: z.number().min(0).max(999999999).optional(),
    periodStart: z.string(),
    periodEnd: z.string(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })
  .refine((data) => data.paymentType !== "HOURLY" || data.hoursWorked !== undefined, {
    message: "Hours worked is required for hourly payments",
    path: ["hoursWorked"],
  })

function toPaymentTypeApi(t: "FIXED_SALARY" | "HOURLY"): "fixed_salary" | "hourly" {
  return t === "FIXED_SALARY" ? "fixed_salary" : "hourly"
}

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

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const searchParams = request.nextUrl.searchParams
    const isPaidFilter = searchParams.get("isPaid")
    const membershipIdParam = searchParams.get("membershipId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 })

    const toDate = new Date(to)
    toDate.setUTCHours(23, 59, 59, 999)

    try {
      const rows = await listPayroll(token, gate.xvmApiVenueId!, {
        from: new Date(from).toISOString(),
        to: toDate.toISOString(),
        isPaid: isPaidFilter !== null ? isPaidFilter === "true" : undefined,
        membershipId: membershipIdParam ? Number(membershipIdParam) : undefined,
      })
      return NextResponse.json(rows.map(toDashboardEntry))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createPayrollSchema>
    try {
      data = createPayrollSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
        membership_id: data.membershipId,
        payment_type: toPaymentTypeApi(data.paymentType),
        base_rate_minor: dollarsToMinorUnits(data.baseRate)!,
        minutes_worked: data.hoursWorked !== undefined ? hoursToMinutes(data.hoursWorked) : undefined,
        bonus_amount_minor: data.bonusAmount !== undefined ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined) : undefined,
        period_start: new Date(data.periodStart).toISOString(),
        period_end: new Date(data.periodEnd).toISOString(),
        notes: data.notes,
      })
      return NextResponse.json(toDashboardEntry(row), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
