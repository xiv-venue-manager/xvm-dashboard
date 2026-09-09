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
  listPayroll,
  createPayrollEntry,
  type ShiftRow,
  type PositionRow,
  type MembershipRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToDollars, hoursToMinutes } from "@/lib/api/position-convert"

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

function groupByRate(resolved: ResolvedShift[]): Map<number, ResolvedShift[]> {
  const groups = new Map<number, ResolvedShift[]>()
  for (const r of resolved) {
    const rate = r.rateMinorPerHour!
    const existing = groups.get(rate)
    if (existing) {
      existing.push(r)
    } else {
      groups.set(rate, [r])
    }
  }
  return groups
}

function groupPeriod(group: ResolvedShift[]): { start: string; end: string } {
  const starts = group.map((r) => new Date(r.shift.actual_start!).getTime())
  const ends = group.map((r) => new Date(r.shift.actual_end!).getTime())
  return {
    start: new Date(Math.min(...starts)).toISOString(),
    end: new Date(Math.max(...ends)).toISOString(),
  }
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
  periodEnd: string
): Promise<MemberResult[]> {
  const [members, shifts, positions, existingEntries] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listShiftsChunked(token, xvmApiVenueId, { from: periodStart, to: periodEnd }),
    listPositions(token, xvmApiVenueId),
    listPayroll(token, xvmApiVenueId, { from: periodStart, to: periodEnd }),
  ])

  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))
  const completedShifts = shifts.filter(
    (s) => s.status === "completed" && s.actual_start !== null && s.actual_end !== null
  )

  return members.map((member) => {
    const entriesForMember = existingEntries.filter((e) => e.membership_id === member.id)
    const memberShifts = completedShifts.filter((s) => s.membership_id === member.id)

    const eligible = memberShifts.filter((shift) => {
      const shiftEnd = new Date(shift.actual_end!).getTime()
      return !entriesForMember.some((entry) => {
        const start = new Date(entry.period_start).getTime()
        const end = new Date(entry.period_end).getTime()
        return shiftEnd >= start && shiftEnd <= end
      })
    })

    if (eligible.length === 0) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "no_shifts" }
    }

    const resolved: ResolvedShift[] = eligible.map((shift) => {
      const start = new Date(shift.actual_start!).getTime()
      const end = new Date(shift.actual_end!).getTime()
      const hours = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100
      const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
      const rateMinorPerHour = position?.hourly_rate_minor ?? null
      return { shift, hours, rateMinorPerHour }
    })

    const anyUnresolved = resolved.some((r) => r.rateMinorPerHour === null)
    if (anyUnresolved) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "unresolved_rate" }
    }

    const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
    const totalAmountMinor = resolved.reduce((sum, r) => sum + Math.round(r.hours * r.rateMinorPerHour!), 0)

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
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, periodStart, periodEnd)
      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          shiftCount: r.resolved.length,
          totalHours: r.totalHours,
          estimatedTotal: r.skipped ? null : minorUnitsToDollars(r.totalAmountMinor),
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
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, data.periodStart, data.periodEnd)
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })
      }

      const perMemberEntries = await Promise.all(
        eligible.map(async (r) => {
          const groups = [...groupByRate(r.resolved).entries()]
          const entries = await Promise.all(
            groups.map(async ([rateMinorPerHour, shifts]) => {
              const groupHours = shifts.reduce((sum, s) => sum + s.hours, 0)
              const { start, end } = groupPeriod(shifts)
              const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
                membership_id: r.member.id,
                payment_type: "hourly",
                base_rate_minor: rateMinorPerHour,
                minutes_worked: hoursToMinutes(groupHours)!,
                period_start: start,
                period_end: end,
              })
              return { totalAmount: minorUnitsToDollars(row.total_amount_minor) }
            })
          )
          return {
            membershipId: r.member.id,
            entryCount: entries.length,
            totalHours: r.totalHours,
            totalAmount: minorUnitsToDollars(r.totalAmountMinor),
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
