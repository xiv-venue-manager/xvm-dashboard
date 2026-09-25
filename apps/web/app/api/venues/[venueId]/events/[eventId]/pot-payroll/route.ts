import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { computePotDistribution, type PotStaffMember, type PotTransactionInput } from "@/lib/pot-payroll"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const Decimal = Prisma.Decimal

async function resolveVenueAndMembership(
  venueId: string,
  userId: string
): Promise<
  | { error: NextResponse }
  | {
      venue: NonNullable<Awaited<ReturnType<typeof prisma.venue.findFirst>>>
      membership: NonNullable<Awaited<ReturnType<typeof prisma.membership.findFirst>>>
    }
> {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
  })
  if (!venue) return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId: venue.id, status: "active" },
  })
  if (!membership) {
    return { error: NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 }) }
  }
  return { venue, membership }
}

async function resolvePotInputs(
  venueId: string,
  eventId: string,
  event: NonNullable<Awaited<ReturnType<typeof prisma.event.findFirst>>>
) {
  const [settings, shifts, transactionsRaw] = await Promise.all([
    prisma.venuePotSettings.findUnique({ where: { venueId } }),
    prisma.shift.findMany({
      where: { eventId, status: "COMPLETED" },
      include: { membership: true },
    }),
    prisma.transaction.findMany({ where: { eventId } }),
  ])

  // Resolve every role referenced by either a shift's own roleId or a membership's
  // roleId, in one batch — mirrors lib/payroll-rates.ts's fetchRoleRates pattern.
  const roleIdsToFetch = new Set<string>()
  for (const shift of shifts) {
    if (shift.roleId) roleIdsToFetch.add(shift.roleId)
    if (shift.membership?.roleId) roleIdsToFetch.add(shift.membership.roleId)
  }
  const roles = await prisma.role.findMany({
    where: { id: { in: Array.from(roleIdsToFetch) } },
    select: { id: true, potPayoutMode: true, contractorSharesPot: true },
  })
  const roleById = new Map(roles.map((r) => [r.id, r]))

  // One PotStaffMember per membership that has at least one shift on this event.
  const staffByMembership = new Map<string, PotStaffMember>()
  for (const shift of shifts) {
    if (!shift.membershipId || !shift.membership) continue
    const hasActuals = Boolean(shift.actualStart && shift.actualEnd)

    const existing = staffByMembership.get(shift.membershipId)
    if (existing) {
      existing.hasQualifyingShift = existing.hasQualifyingShift || hasActuals
      continue
    }

    // Role precedence: this shift's own tagged role first, else the membership's
    // primary custom role — same precedence lib/payroll-rates.ts uses for pay rates.
    const resolvedRoleId = shift.roleId ?? shift.membership.roleId
    const resolvedRole = resolvedRoleId ? roleById.get(resolvedRoleId) : undefined

    staffByMembership.set(shift.membershipId, {
      membershipId: shift.membershipId,
      potPayoutMode: resolvedRole?.potPayoutMode ?? "STANDARD",
      contractorSharesPot: resolvedRole?.contractorSharesPot ?? false,
      tipPooled: shift.membership.tipPooled ?? settings?.defaultTipPooled ?? false,
      hasQualifyingShift: hasActuals,
    })
  }

  // Transactions reference staff via Transaction.staffId (a User id, not a Membership
  // id) — map each to the membership id of whichever shift-having membership shares
  // that userId, so computePotDistribution can key everything by membershipId.
  const membershipIdByUserId = new Map<string, string>()
  for (const shift of shifts) {
    if (shift.membership?.userId && shift.membershipId) {
      membershipIdByUserId.set(shift.membership.userId, shift.membershipId)
    }
  }

  const transactions: PotTransactionInput[] = transactionsRaw
    .filter((t) => t.type === "SALE" || t.type === "TIP")
    .map((t) => ({
      type: t.type as "SALE" | "TIP",
      amount: t.amount,
      membershipId: t.staffId ? (membershipIdByUserId.get(t.staffId) ?? null) : null,
    }))

  const staff = Array.from(staffByMembership.values())
  const result = computePotDistribution(staff, transactions, {
    taxPercent: settings?.taxPercent ?? new Decimal(0),
    includeSalesInPot: settings?.includeSalesInPot ?? false,
  })

  return { settings, result }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      const { venueId, eventId } = await context.params

      const resolvedAuth = await resolveVenueAndMembership(venueId, session.user.id)
      if ("error" in resolvedAuth) return resolvedAuth.error
      const { venue, membership: callerMembership } = resolvedAuth
      if (!["OWNER", "MANAGER"].includes(callerMembership.role)) {
        return NextResponse.json({ error: "Only owners and managers can preview pot payroll" }, { status: 403 })
      }

      const event = await prisma.event.findFirst({ where: { id: eventId, venueId: venue.id } })
      if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

      const resolved = await resolvePotInputs(venue.id, eventId, event)

      return NextResponse.json({ preview: resolved.result })
    } catch (error) {
      console.error("Error previewing pot payroll:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      const { venueId, eventId } = await context.params

      const resolvedAuth = await resolveVenueAndMembership(venueId, session.user.id)
      if ("error" in resolvedAuth) return resolvedAuth.error
      const { venue, membership: callerMembership } = resolvedAuth
      if (!["OWNER", "MANAGER"].includes(callerMembership.role)) {
        return NextResponse.json({ error: "Only owners and managers can generate pot payroll" }, { status: 403 })
      }

      const event = await prisma.event.findFirst({ where: { id: eventId, venueId: venue.id } })
      if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
      if (event.status !== "COMPLETED") {
        return NextResponse.json({ error: "Pot payroll can only be generated for completed events" }, { status: 400 })
      }

      // Sales moved to xvm-api and no longer write prisma.transaction, so resolvePotInputs'
      // revenue query below always returns empty. Generation is disabled until Events moves
      // to xvm-api too and pot revenue can be computed there instead.
      return NextResponse.json(
        { error: "Pot payroll generation is unavailable until the Events cutover lands" },
        { status: 503 }
      )
    } catch (error) {
      console.error("Error generating pot payroll:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
