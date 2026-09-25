import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  listMemberships,
  listShiftsChunked,
  listPositions,
  listPayrollChunked,
  createPayrollEntry,
  getVenue,
  type MembershipRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToGil } from "@/lib/api/position-convert"
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

interface MemberResult {
  member: MembershipRow
  resolved: ResolvedShift[]
  totalHours: number
  totalAmountMinor: number
  skipped: boolean
  skipReason: "no_shifts" | "unresolved_rate" | null
}

async function computeAllMembers(
  token: string,
  xvmApiVenueId: string,
  periodStart: string,
  periodEnd: string,
  timeZone: string
): Promise<MemberResult[]> {
  const fromIso = new Date(periodStart).toISOString()
  const toIso = endOfLocalDayUtc(periodEnd, timeZone).toISOString()
  // See the identical comment in generate/route.ts's findEligibleShifts: an
  // entry's period_end can fall after the window it was generated for, so
  // this must be fetched up to now, not bounded to the requested window.
  const entriesToIso = new Date().toISOString()

  const [members, shifts, positions, existingEntries] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listShiftsChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
    listPositions(token, xvmApiVenueId),
    listPayrollChunked(token, xvmApiVenueId, { from: fromIso, to: entriesToIso }),
  ])

  const positionById = new Map<number, PositionRate>(
    positions.map((p) => [p.id, { id: p.id, hourlyRateMinor: p.hourly_rate_minor }])
  )
  const entryWindowsByMember = new Map<number | null, { periodStart: string; periodEnd: string }[]>()
  for (const e of existingEntries) {
    const list = entryWindowsByMember.get(e.membership_id)
    const window = { periodStart: e.period_start, periodEnd: e.period_end }
    if (list) {
      list.push(window)
    } else {
      entryWindowsByMember.set(e.membership_id, [window])
    }
  }
  const completedShifts = shifts.filter(
    (s) => s.status === "completed" && s.actual_start !== null && s.actual_end !== null
  )

  return members.map((member) => {
    const entriesForMember = entryWindowsByMember.get(member.id) ?? []
    const memberShifts = completedShifts.filter((s) => s.membership_id === member.id)

    const eligible = memberShifts.filter(
      (shift) => !isShiftCovered(new Date(shift.actual_end!).getTime(), entriesForMember)
    )

    if (eligible.length === 0) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "no_shifts" }
    }

    const resolved: ResolvedShift[] = eligible.map((shift) =>
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

    const anyUnresolved = resolved.some((r) => r.rateMinorPerHour === null)
    if (anyUnresolved) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "unresolved_rate" }
    }

    const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
    const groups = groupByRate(resolved)
    const totalAmountMinor = [...groups.entries()].reduce(
      (sum, [rate, group]) => sum + hourlyAmountMinor(rate, totalMinutesWorked(group)),
      0
    )

    return { member, resolved, totalHours, totalAmountMinor, skipped: false, skipReason: null }
  })
}

const generateAllSchema = z
  .object({ periodStart: z.string(), periodEnd: z.string() })
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
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 })
    }

    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, periodStart, periodEnd, venue.timezone)
      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          shiftCount: r.resolved.length,
          totalHours: r.totalHours,
          estimatedTotal: r.skipped ? null : minorUnitsToGil(r.totalAmountMinor),
          entryCount: r.skipped ? 0 : groupByRate(r.resolved).size,
          skipped: r.skipped,
          skipReason: r.skipReason,
        })),
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate-all] GET error")
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

    let data: z.infer<typeof generateAllSchema>
    try {
      data = generateAllSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const results = await computeAllMembers(
        token,
        gate.xvmApiVenueId!,
        data.periodStart,
        data.periodEnd,
        venue.timezone
      )
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })
      }

      const perMemberEntries = await Promise.all(
        eligible.map(async (r) => {
          const groups = [...groupByRate(r.resolved).entries()]
          const createdTotalsMinor = await Promise.all(
            groups.map(async ([rateMinorPerHour, shifts]) => {
              const minutesWorked = totalMinutesWorked(shifts)
              const { start, end } = groupPeriod(shifts)
              const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
                membership_id: r.member.id,
                payment_type: "hourly",
                base_rate_minor: rateMinorPerHour,
                minutes_worked: minutesWorked,
                period_start: start,
                period_end: end,
              })
              return row.total_amount_minor
            })
          )
          return {
            membershipId: r.member.id,
            entryCount: createdTotalsMinor.length,
            totalHours: r.totalHours,
            totalAmount: minorUnitsToGil(createdTotalsMinor.reduce((sum, m) => sum + m, 0)),
          }
        })
      )

      return NextResponse.json(
        {
          generated: perMemberEntries.length,
          skipped: results.filter((r) => r.skipped).length,
          entries: perMemberEntries,
        },
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate-all] POST error")
    }
  },
  { requests: 5, window: "1 m" }
)
