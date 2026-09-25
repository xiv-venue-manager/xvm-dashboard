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
  listPayrollChunked,
  createPayrollEntry,
  getVenue,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { gilToMinorUnits, minorUnitsToGil, minutesToHours } from "@/lib/api/position-convert"
import { endOfLocalDayUtc } from "@/lib/local-day"
import {
  resolveShiftRate,
  isShiftCovered,
  groupByRate,
  groupPeriod,
  totalMinutesWorked,
  hourlyAmountMinor,
  type ResolvedShift,
  type PositionRate,
} from "@/lib/payroll-generate"

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
  to: string,
  timeZone: string
): Promise<ShiftRow[]> {
  const fromIso = new Date(from).toISOString()
  const toIso = endOfLocalDayUtc(to, timeZone).toISOString()
  // Existing entries are fetched up to *now*, not just the requested window's
  // end: an entry's period_end can fall after the window it was generated for
  // (groupPeriod sets it to the group's own last shift time), so bounding this
  // query to the same window can miss a real covering entry and pay its
  // shifts a second time. Entries can only ever have a period_end in the past
  // (they're built from completed shifts), so "now" is always wide enough.
  const entriesToIso = new Date().toISOString()

  const [shifts, existingEntries] = await Promise.all([
    listShiftsChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
    listPayrollChunked(token, xvmApiVenueId, { from: fromIso, to: entriesToIso, membershipId }),
  ])

  const completed = shifts.filter(
    (s) =>
      s.status === "completed" &&
      s.membership_id === membershipId &&
      s.actual_start !== null &&
      s.actual_end !== null
  )

  const entryWindows = existingEntries.map((e) => ({ periodStart: e.period_start, periodEnd: e.period_end }))
  return completed.filter((shift) => !isShiftCovered(new Date(shift.actual_end!).getTime(), entryWindows))
}

async function resolveRates(token: string, xvmApiVenueId: string, shifts: ShiftRow[]): Promise<ResolvedShift[]> {
  const positions = await listPositions(token, xvmApiVenueId)
  const positionById = new Map<number, PositionRate>(
    positions.map((p) => [p.id, { id: p.id, hourlyRateMinor: p.hourly_rate_minor }])
  )

  return shifts.map((shift) =>
    resolveShiftRate(
      {
        id: shift.id,
        actualStart: shift.actual_start!,
        actualEnd: shift.actual_end!,
        minutesWorked: shift.worked_minutes ?? 0,
        positionId: shift.position_id,
      },
      positionById
    )
  )
}

function summarize(resolved: ResolvedShift[]) {
  const unresolved = resolved.filter((r) => r.rateMinorPerHour === null)
  const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
  // Ceiling per rate-group over the group's total minutes, mirroring exactly
  // what the POST below actually creates - a per-shift sum here previously
  // showed a different total than the entries it was previewing.
  const groups = groupByRate(resolved.filter((r) => r.rateMinorPerHour !== null))
  const totalAmountMinor = [...groups.entries()].reduce(
    (sum, [rate, group]) => sum + hourlyAmountMinor(rate, totalMinutesWorked(group)),
    0
  )
  return { unresolved, totalHours, totalAmountMinor }
}

const generateSchema = z
  .object({
    membershipId: z.number().int().positive(),
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
    if (!Number.isInteger(membershipId) || membershipId <= 0) {
      return NextResponse.json({ error: "membershipId must be a positive integer" }, { status: 400 })
    }

    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        membershipId,
        periodStart,
        periodEnd,
        venue.timezone
      )
      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)
      const entryCount = groupByRate(resolved.filter((r) => r.rateMinorPerHour !== null)).size

      return NextResponse.json({
        shifts: resolved.map((r) => ({
          id: r.shift.id,
          actualStart: r.shift.actualStart,
          actualEnd: r.shift.actualEnd,
          hoursWorked: r.hours,
          resolvedRate: r.rateMinorPerHour !== null ? minorUnitsToGil(r.rateMinorPerHour) : null,
        })),
        summary: {
          shiftCount: eligible.length,
          totalHours,
          estimatedTotal: unresolved.length === 0 ? minorUnitsToGil(totalAmountMinor) : null,
          unresolvedShiftCount: unresolved.length,
          entryCount,
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
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        data.membershipId,
        data.periodStart,
        data.periodEnd,
        venue.timezone
      )
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No unpaid completed shifts found in this period" }, { status: 400 })
      }

      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved } = summarize(resolved)

      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            error: "Some shifts in this period have no resolvable rate",
            unresolvedShiftIds: unresolved.map((r) => r.shift.id),
          },
          { status: 409 }
        )
      }

      const groups = [...groupByRate(resolved).entries()]
      const bonusGroupIndex = groups.reduce((bestIndex, [, shifts], index) => {
        const bestHours = groups[bestIndex][1].reduce((sum, r) => sum + r.hours, 0)
        const hours = shifts.reduce((sum, r) => sum + r.hours, 0)
        return hours > bestHours ? index : bestIndex
      }, 0)

      const settled = await Promise.allSettled(
        groups.map(async ([rateMinorPerHour, shifts], index) => {
          const minutesWorked = totalMinutesWorked(shifts)
          const { start, end } = groupPeriod(shifts)
          const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
            membership_id: data.membershipId,
            payment_type: "hourly",
            base_rate_minor: rateMinorPerHour,
            minutes_worked: minutesWorked,
            bonus_amount_minor:
              index === bonusGroupIndex && data.bonusAmount !== undefined
                ? (gilToMinorUnits(data.bonusAmount) ?? undefined)
                : undefined,
            period_start: start,
            period_end: end,
            notes: data.notes,
          })
          return {
            id: row.id,
            totalAmount: minorUnitsToGil(row.total_amount_minor),
            hoursWorked: minutesToHours(row.minutes_worked),
          }
        })
      )

      // If a later group's create call fails after an earlier one already
      // committed, that entry is real and should not be reported as if
      // nothing happened - list what succeeded and what didn't rather than
      // throwing a generic error that hides the partial success.
      const entries: { id: number; totalAmount: number | null; hoursWorked: number | null }[] = []
      const failedGroups: { rateMinorPerHour: number; error: string }[] = []
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          entries.push(result.value)
        } else {
          failedGroups.push({
            rateMinorPerHour: groups[index][0],
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          })
        }
      })

      // Any non-2xx status makes the existing frontend error path fire (it
      // only checks response.ok) - a 201 here would look like full success
      // even with entries missing, so partial failure must not stay in the
      // 2xx range even though some entries really were created.
      if (failedGroups.length > 0) {
        return NextResponse.json(
          {
            error:
              entries.length === 0
                ? "Payroll generation failed"
                : "Some pay groups could not be created; the ones that succeeded were not rolled back",
            entries,
            failedGroups,
            shiftsLinked: eligible.length,
          },
          { status: 502 }
        )
      }

      return NextResponse.json({ entries, shiftsLinked: eligible.length, failedGroups }, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
