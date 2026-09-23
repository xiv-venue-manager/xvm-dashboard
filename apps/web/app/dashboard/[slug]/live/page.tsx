import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { LiveDashboard } from "@/components/live-dashboard"
import { resolveDisplayName } from "@/lib/display-name"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import {
  getVenue,
  getFinanceSummary,
  listShiftsOnNow,
  listMemberships,
  type FinanceSummary,
  type MembershipRow,
  type RevenueVisibility,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToDollars } from "@/lib/api/position-convert"

export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: { userId: session.user.id },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const revenueVisibility = await readXvm<RevenueVisibility>(
    "live page venue",
    "hide",
    async (t, v) => (await getVenue(t, v)).revenue_visibility
  )
  const showRevenue = canManage || revenueVisibility !== "hide"

  // Find the currently active event (or the next upcoming one)
  const now = new Date()
  let activeEvent = await prisma.event.findFirst({
    where: {
      venueId: venue.id,
      status: "ACTIVE",
    },
  })

  // If no active event, check for one starting within 30 minutes
  let isUpcoming = false
  if (!activeEvent) {
    const soon = new Date(now.getTime() + 30 * 60 * 1000)
    const upcoming = await prisma.event.findFirst({
      where: {
        venueId: venue.id,
        status: "PUBLISHED",
        startTime: { lte: soon, gte: now },
      },
      orderBy: { startTime: "asc" },
    })
    if (upcoming) {
      activeEvent = upcoming
      isUpcoming = true
    }
  }

  // Get current patron count
  const patronCount = activeEvent
    ? (await prisma.patronLog.count({
        where: {
          venueId: venue.id,
          action: "ENTER",
          timestamp: { gte: activeEvent.startTime },
        },
      })) -
      (await prisma.patronLog.count({
        where: {
          venueId: venue.id,
          action: "LEAVE",
          timestamp: { gte: activeEvent.startTime },
        },
      }))
    : 0

  const eventStart = activeEvent?.startTime
  const eventSummary =
    eventStart && eventStart <= now && showRevenue
      ? await readXvm<FinanceSummary | null>("live page revenue", null, (t, v) =>
          getFinanceSummary(t, v, { from: eventStart.toISOString(), to: now.toISOString() })
        )
      : null
  const revenueDisplay = showRevenue ? (minorUnitsToDollars(eventSummary?.total_revenue ?? 0) ?? 0) : null
  const saleCountDisplay = eventSummary?.transaction_count ?? 0

  // Patron roster (recent ENTERs, crude in-venue list)
  const patronRoster = activeEvent
    ? await prisma.patronLog.findMany({
        where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: activeEvent.startTime } },
        orderBy: { loggedAt: "desc" },
        take: 20,
        select: { characterName: true, loggedAt: true },
      })
    : []

  const [onNow, roster] = await Promise.all([
    readXvm("live page on-now", [] as ShiftRow[], (t, v) => listShiftsOnNow(t, v)),
    readXvm("live page roster", [] as MembershipRow[], (t, v) => listMemberships(t, v)),
  ])
  const membersById = new Map(roster.map((m) => [m.id, m]))
  const onShiftStaff = onNow.slice(0, 10).map((s) => {
    const member = s.membership_id !== null ? membersById.get(s.membership_id) : undefined
    const name = resolveDisplayName({ nickname: member?.nickname, displayName: member?.person.display_name })
    return { name: name === "Unknown" ? "Staff" : name, role: member?.effective_tier.toUpperCase() ?? "STAFF" }
  })

  // New patrons tonight (first visit this event)
  const newTonightCount = activeEvent
    ? await prisma.patronLog.count({
        where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: activeEvent.startTime } },
      })
    : 0

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        {/* Header — matches all other dashboard pages */}
        <div className="head-row">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
                {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
              </span>
            </div>
            <h1 className="page-h1">Live Mode</h1>
          </div>
        </div>

        {activeEvent ? (
          <LiveDashboard
            venueId={venue.id}
            event={{
              id: activeEvent.id,
              title: activeEvent.title,
              eventType: activeEvent.eventType,
              startTime: activeEvent.startTime.toISOString(),
              endTime: activeEvent.endTime.toISOString(),
              status: activeEvent.status,
            }}
            isUpcoming={isUpcoming}
            initialPatronCount={Math.max(0, patronCount)}
            initialRevenue={revenueDisplay}
            initialSaleCount={saleCountDisplay}
            initialNewTonight={newTonightCount}
            showRevenue={showRevenue}
            currentUserId={session.user.id}
            scopeSalesToOwn={!canManage && revenueVisibility === "own"}
            canManage={canManage}
            revenueLabel={canManage || revenueVisibility === "all" ? "Total Revenue" : "My Sales"}
            patronRoster={patronRoster.map((p) => ({
              name: p.characterName ?? "Unknown",
              arrivedAt: p.loggedAt.toISOString(),
            }))}
            onShiftStaff={onShiftStaff}
          />
        ) : (
          <div>
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <p className="text-muted-foreground">
                  {canManage
                    ? "No active event. Create one and set it to Active to start tracking patrons and sales in real time."
                    : "Live Mode activates when an event is running. Check back when the night starts."}
                </p>
                {canManage && (
                  <Link
                    href={`/dashboard/${slug}/events/new`}
                    className="inline-flex items-center gap-2 xiv-btn-shimmer xiv-cta px-5 py-2.5 rounded-lg text-sm font-semibold"
                  >
                    Create an event
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
