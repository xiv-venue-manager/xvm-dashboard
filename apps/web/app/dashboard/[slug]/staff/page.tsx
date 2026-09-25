import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatGilCompact } from "@/lib/format"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { Users, UserPlus, Shield, AlertTriangle } from "lucide-react"
import { FormerStaff } from "@/components/former-staff"
import { PendingInvites } from "@/components/pending-invites"
import { StaffTable, type StaffMember } from "@/components/staff-table"
import { VenueLayout } from "@/components/venue-layout"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import {
  listMemberships,
  listPositions,
  listInvites,
  listShifts,
  listShiftsOnNow,
  listFinanceTransactions,
  type MembershipRow,
  type PositionRow,
  type ShiftRow,
  type FinanceTransactionRow,
} from "@/lib/api/xvm-api"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { minorUnitsToGil } from "@/lib/api/position-convert"
import { toPendingInviteShape, type PendingInviteShape } from "@/lib/pending-invites"

import { RoleBadge } from "@/components/role-badge"
import { StaffVisibilitySettings } from "@/components/staff-visibility-settings"

// Mirrors staff/route.ts's toStaffShape (duplicated per this codebase's
// per-file convention - the route files don't share it with each other either).
function toStaffShape(member: MembershipRow, positionsById: Map<number, PositionRow>, venueId: string): StaffMember {
  return {
    id: member.id,
    role: member.effective_tier.toUpperCase() as "OWNER" | "MANAGER" | "STAFF",
    additionalRoles: member.position_ids
      .map((id) => positionsById.get(id))
      .filter((p): p is PositionRow => Boolean(p))
      .map((p) => ({ name: p.name, color: p.color })),
    joinedAt: null,
    isOnShift: false,
    nickname: member.nickname,
    user: {
      id: member.person.id,
      name: member.person.display_name,
      displayName: member.person.display_name,
      image: null,
      characterName: null,
      discordId: member.person.discord_id,
    },
    venueId,
  }
}

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug } = await params

  // Get venue
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: {
          userId: session.user.id,
        },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) {
    notFound()
  }

  const userRole = venue.memberships[0].role

  // xvm-api splits active memberships and pending invites into two separate
  // tables/endpoints, unlike Prisma's unified Membership row with a
  // status: "pending" filter - a real structural change, not a field rename.
  let activeStaff: StaffMember[] = []
  let formerStaff: StaffMember[] = []
  let pendingInvites: PendingInviteShape[] = []

  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      const [memberships, positions, invites] = await Promise.all([
        listMemberships(token, venue.xvmApiVenueId),
        listPositions(token, venue.xvmApiVenueId),
        listInvites(token, venue.xvmApiVenueId),
      ])
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      // roster() returns every membership regardless of employment status -
      // this page is the active roster, terminated members surface separately
      // below via formerStaff instead.
      activeStaff = memberships.filter((m) => m.is_employed).map((m) => toStaffShape(m, positionsById, slug))
      formerStaff = memberships.filter((m) => !m.is_employed).map((m) => toStaffShape(m, positionsById, slug))
      pendingInvites = invites.map(toPendingInviteShape)
    } catch (err) {
      console.error("[staff page] xvm-api fetch error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  const canManageStaff = ["OWNER", "MANAGER"].includes(userRole)

  // Server Component: evaluated once per request, not a re-rendering client component that would need memoization.
  // eslint-disable-next-line react-hooks/purity
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const statsTo = new Date(weekAgo.getTime() + 7 * 24 * 60 * 60 * 1000)
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const [activeShifts, weeklyShifts, weeklyTransactions] = await Promise.all([
    readXvm("staff page on-now", [] as ShiftRow[], (t, v) => listShiftsOnNow(t, v)),
    readXvm("staff page weekly shifts", [] as ShiftRow[], (t, v) =>
      listShifts(t, v, { from: weekAgo.toISOString(), to: statsTo.toISOString() })
    ),
    readXvm("staff page weekly tips", [] as FinanceTransactionRow[], (t, v) =>
      listFinanceTransactions(t, v, { from: weekAgo.toISOString(), to: statsTo.toISOString() })
    ),
  ])

  const hoursThisWeek = weeklyShifts.reduce((sum, s) => {
    if (s.status !== "completed" && s.status !== "active") return sum
    if (!s.scheduled_start || !s.scheduled_end || Date.parse(s.scheduled_start) < weekAgo.getTime()) return sum
    return sum + (Date.parse(s.scheduled_end) - Date.parse(s.scheduled_start)) / (1000 * 60 * 60)
  }, 0)
  const tipsThisWeek =
    minorUnitsToGil(weeklyTransactions.filter((tx) => tx.kind === "tip").reduce((sum, tx) => sum + tx.amount, 0)) ??
    0

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="head-row">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
                {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
              </span>
            </div>
            <h1 className="page-h1">Staff</h1>
          </div>
          {canManageStaff && (
            <div className="flex gap-2">
              <Button variant="outline" asChild size="sm" className="sm:size-default">
                <Link href={`/dashboard/${slug}/staff/roles`}>
                  <span className="hidden lg:inline">Manage Roles</span>
                  <span className="lg:hidden">Roles</span>
                </Link>
              </Button>
              <Button asChild size="sm" className="sm:size-default">
                <Link href={`/dashboard/${slug}/staff/invite`}>
                  <span className="hidden sm:inline">Invite Staff</span>
                  <span className="sm:hidden">Invite</span>
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="kpis mb-6">
          <div className="stat">
            <div className="top">
              <span className="sb">
                <Users size={16} />
              </span>
            </div>
            <div className="k">Active staff</div>
            <div className="v">{activeStaff.length}</div>
            <div className="delta flat">Members</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className={activeShifts.length > 0 ? "sb em" : "sb"}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <div className="k">On shift now</div>
            <div className="v">{activeShifts.length}</div>
            <div className="delta flat">{activeShifts.length > 0 ? "clocked in" : "no active shifts"}</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className="sb">
                <Shield size={16} />
              </span>
            </div>
            <div className="k">Hours this week</div>
            <div className="v">
              {Math.round(hoursThisWeek)} <span className="unit">h</span>
            </div>
            <div className="delta flat">scheduled</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className="sb am">
                <Users size={16} />
              </span>
            </div>
            <div className="k">Tips pool (wk)</div>
            <div className="v">
              {tipsThisWeek > 0 ? formatGilCompact(tipsThisWeek) : "0"} <span className="unit">gil</span>
            </div>
            <div className="delta flat">split by hours</div>
          </div>
        </div>

        {/* Staff table */}
        <StaffTable members={activeStaff} slug={slug} canManage={canManageStaff} />

        {/* Pending + individual edit sections */}
        <div className="space-y-8 mt-6">
          {/* Pending Invites */}
          <PendingInvites invites={pendingInvites} slug={slug} canManageStaff={canManageStaff} />

          {/* Former Staff */}
          <FormerStaff members={formerStaff} slug={slug} canManageStaff={canManageStaff} />

          {canManageStaff && <StaffVisibilitySettings venueId={venue.id} />}
        </div>
      </div>
    </VenueLayout>
  )
}
