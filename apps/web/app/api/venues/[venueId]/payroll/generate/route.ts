import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  listShiftsChunked,
  listPositions,
  listPayroll,
  createPayrollEntry,
  type ShiftRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes, minutesToHours } from "@/lib/api/position-convert"

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

interface ResolvedShift {
  shift: ShiftRow
  hours: number
  rateMinorPerHour: number | null
}

/**
 * Eligible shifts: completed, belong to this membership, actual_end inside the
 * window, and NOT already covered by an existing payroll entry's period for this
 * membership (window-overlap is the only eligibility signal available - xvm-api
 * has no explicit shift-to-payroll-entry link).
 */
async function findEligibleShifts(
  token: string,
  xvmApiVenueId: string,
  membershipId: number,
  from: string,
  to: string
): Promise<ShiftRow[]> {
  const [shifts, existingEntries] = await Promise.all([
    listShiftsChunked(token, xvmApiVenueId, { from, to }),
    listPayroll(token, xvmApiVenueId, { from, to, membershipId }),
  ])

  const completed = shifts.filter(
    (s) => s.status === "completed" && s.membership_id === membershipId && s.actual_end !== null
  )

  return completed.filter((shift) => {
    const shiftEnd = new Date(shift.actual_end!).getTime()
    return !existingEntries.some((entry) => {
      const start = new Date(entry.period_start).getTime()
      const end = new Date(entry.period_end).getTime()
      return shiftEnd >= start && shiftEnd <= end
    })
  })
}

async function resolveRates(token: string, xvmApiVenueId: string, shifts: ShiftRow[]): Promise<ResolvedShift[]> {
  const positions = await listPositions(token, xvmApiVenueId)
  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))

  return shifts.map((shift) => {
    const start = shift.actual_start ? new Date(shift.actual_start).getTime() : null
    const end = shift.actual_end ? new Date(shift.actual_end).getTime() : null
    const hours = start !== null && end !== null ? Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100 : 0

    const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
    const rateMinorPerHour = position?.hourly_rate_minor ?? null

    return { shift, hours, rateMinorPerHour }
  })
}

function summarize(resolved: ResolvedShift[]) {
  const unresolved = resolved.filter((r) => r.rateMinorPerHour === null)
  const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
  const totalAmountMinor = resolved.reduce((sum, r) => sum + Math.round(r.hours * (r.rateMinorPerHour ?? 0)), 0)
  return { unresolved, totalHours, totalAmountMinor }
}

const generateSchema = z
  .object({
    membershipId: z.number().int(),
    periodStart: z.string(),
    periodEnd: z.string(),
    bonusAmount: z.number().min(0).max(999999999).optional(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })

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

    const sp = request.nextUrl.searchParams
    const membershipIdParam = sp.get("membershipId")
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!membershipIdParam || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "membershipId, periodStart, and periodEnd are required" }, { status: 400 })
    }
    const membershipId = Number(membershipIdParam)

    try {
      const eligible = await findEligibleShifts(token, gate.xvmApiVenueId!, membershipId, periodStart, periodEnd)
      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)

      return NextResponse.json({
        shifts: resolved.map((r) => ({
          id: r.shift.id,
          actualStart: r.shift.actual_start,
          actualEnd: r.shift.actual_end,
          hoursWorked: r.hours,
          resolvedRate: r.rateMinorPerHour !== null ? minorUnitsToDollars(r.rateMinorPerHour) : null,
        })),
        summary: {
          shiftCount: eligible.length,
          totalHours,
          estimatedTotal: unresolved.length === 0 ? minorUnitsToDollars(totalAmountMinor) : null,
          unresolvedShiftCount: unresolved.length,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] GET error")
    }
  },
  { requests: 30, window: "1 m" }
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

    let data: z.infer<typeof generateSchema>
    try {
      data = generateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        data.membershipId,
        data.periodStart,
        data.periodEnd
      )
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No unpaid completed shifts found in this period" }, { status: 400 })
      }

      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)

      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            error: "Some shifts in this period have no resolvable rate",
            unresolvedShiftIds: unresolved.map((r) => r.shift.id),
          },
          { status: 409 }
        )
      }

      const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
        membership_id: data.membershipId,
        payment_type: "hourly",
        base_rate_minor: totalHours > 0 ? Math.round(totalAmountMinor / totalHours) : 0,
        minutes_worked: hoursToMinutes(totalHours)!,
        bonus_amount_minor: data.bonusAmount !== undefined ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined) : undefined,
        period_start: new Date(data.periodStart).toISOString(),
        period_end: new Date(data.periodEnd).toISOString(),
        notes: data.notes,
      })

      return NextResponse.json(
        {
          id: row.id,
          totalAmount: minorUnitsToDollars(row.total_amount_minor),
          hoursWorked: minutesToHours(row.minutes_worked),
          shiftsLinked: eligible.length,
        },
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
