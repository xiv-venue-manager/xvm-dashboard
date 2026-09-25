import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatReadout } from "@/components/ui/stat-readout"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { prisma } from "@/lib/prisma"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getFinanceSummary, listShifts, listTasks, type ShiftRow } from "@/lib/api/xvm-api"
import { minorUnitsToGil } from "@/lib/api/position-convert"
import { intToPriority } from "@/lib/api/task-convert"
import { VenueLayout } from "@/components/venue-layout"
import { LocalTimeRange } from "@/components/server-time"
import { OverviewRevenueChart } from "@/components/overview-revenue-chart"
import { formatGil } from "@/lib/format"
import { OverviewTasks } from "@/components/overview-tasks"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { CharacterLinkNudge } from "@/components/character-link-nudge"
import { TodayDateLabel } from "@/components/today-date-label"
import { format, subDays, subWeeks, formatDistanceToNow } from "date-fns"
import {
  Radio,
  ArrowRight,
  Users,
  TrendingUp,
  Calendar,
  Heart,
  BarChart3,
  Cog,
  ChevronRight,
  Clock,
} from "lucide-react"

export default async function VenueDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const now = new Date()
  const weekAgo = subDays(now, 7)
  const twoWeeksAgo = subDays(now, 14)

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
      _count: { select: { follows: true } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const revenueBetween = (label: string, from: Date, to: Date) =>
    readXvm(label, 0, async (t, v) => {
      const summary = await getFinanceSummary(t, v, { from: from.toISOString(), to: to.toISOString() })
      return minorUnitsToGil(summary.total_revenue) ?? 0
    })
  const canManage = ["OWNER", "MANAGER"].includes(userRole)

  // Live event
  const liveEvent = await prisma.event.findFirst({
    where: { venueId: venue.id, status: "ACTIVE" },
    select: { id: true, title: true, startTime: true },
  })

  // KPI data (owner/manager only)
  let kpis = {
    revenueThisWeek: 0,
    revenuePrev: 0,
    patronsThisWeek: 0,
    patronsPrev: 0,
    avgAttendance: 0,
    upcomingCount: 0,
    newFollowers: venue._count.follows,
  }

  if (canManage) {
    const [revThis, revPrev, patronsThis, patronsPrev, upcomingCount] = await Promise.all([
      revenueBetween("overview revenue this week", weekAgo, now),
      revenueBetween("overview revenue prev week", twoWeeksAgo, weekAgo),
      prisma.patronLog.count({ where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: weekAgo } } }),
      prisma.patronLog.count({
        where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }),
      prisma.event.count({
        where: { venueId: venue.id, startTime: { gte: now }, status: { in: ["PUBLISHED", "ACTIVE"] } },
      }),
    ])
    kpis = {
      revenueThisWeek: revThis,
      revenuePrev: revPrev,
      patronsThisWeek: patronsThis,
      patronsPrev: patronsPrev,
      avgAttendance: 0,
      upcomingCount: upcomingCount,
      newFollowers: venue._count.follows,
    }
  }

  // Recent events for chart + table (last 8)
  const recentEvents = canManage
    ? await prisma.event.findMany({
        where: { venueId: venue.id, status: { in: ["COMPLETED", "ACTIVE"] }, startTime: { lte: now } },
        orderBy: { startTime: "desc" },
        take: 8,
        select: { id: true, title: true, startTime: true, status: true, eventType: true },
      })
    : []

  // Revenue per event for chart
  const chartData = canManage
    ? await Promise.all(
        recentEvents
          .slice()
          .reverse()
          .map(async (ev) => {
            const revenue = await revenueBetween(
              "overview event revenue",
              ev.startTime,
              new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000)
            )
            return {
              label: format(ev.startTime, "d MMM"),
              revenue,
              isToday: format(ev.startTime, "yyyy-MM-dd") === format(now, "yyyy-MM-dd"),
            }
          })
      )
    : []

  // Patron counts per recent event for avg attendance + table
  const patronsPerEvent: number[] = []
  if (canManage && recentEvents.length > 0) {
    const patPerEvent = await Promise.all(
      recentEvents.map((ev) =>
        prisma.patronLog.count({
          where: {
            venueId: venue.id,
            action: "ENTER",
            loggedAt: { gte: ev.startTime, lt: new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000) },
          },
        })
      )
    )
    patronsPerEvent.push(...patPerEvent)
    kpis.avgAttendance =
      patPerEvent.length > 0 ? Math.round(patPerEvent.reduce((a, b) => a + b, 0) / patPerEvent.length) : 0
  }

  // Combine events with revenue (chartData reversed = newest first, same order as recentEvents)
  const recentEventsWithData = recentEvents.map((ev, i) => ({
    ...ev,
    revenue: chartData[chartData.length - 1 - i]?.revenue ?? 0,
    patrons: patronsPerEvent[i] ?? 0,
  }))

  // Next upcoming event
  const nextEvent = await prisma.event.findFirst({
    where: { venueId: venue.id, startTime: { gte: now }, status: { in: ["PUBLISHED", "ACTIVE"] } },
    orderBy: { startTime: "asc" },
    select: { id: true, title: true, startTime: true, endTime: true, eventType: true },
  })

  const openTasks = await readXvm("overview open tasks", [], async (t, v) =>
    (await listTasks(t, v)).slice(0, 5).map((task) => ({
      id: String(task.id),
      title: task.title,
      dueDate: task.due_at ? new Date(task.due_at) : null,
      priority: intToPriority(task.priority),
    }))
  )

  // Announcements
  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      dismissals: { none: { userId: session.user.id } },
    },
    select: { id: true, title: true, message: true, link: true, linkLabel: true },
    orderBy: { createdAt: "desc" },
  })

  const hasLinkedCharacter =
    (await prisma.userCharacter.count({
      where: { userId: session.user.id },
    })) > 0

  const myShiftsFrom = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const myShifts = (
    await readXvm("overview my shifts", [] as ShiftRow[], (t, v) =>
      listShifts(t, v, { from: myShiftsFrom.toISOString(), to: new Date(myShiftsFrom.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(), mine: true })
    )
  )
    .flatMap((s) =>
      (s.status === "scheduled" || s.status === "active") &&
      s.scheduled_start &&
      s.scheduled_end &&
      Date.parse(s.scheduled_start) >= myShiftsFrom.getTime()
        ? [{ id: s.id, status: s.status, scheduledStart: new Date(s.scheduled_start), scheduledEnd: new Date(s.scheduled_end) }]
        : []
    )
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
    .slice(0, 3)

  // Delta helpers
  const pct = (current: number, prev: number) => (prev === 0 ? null : Math.round(((current - prev) / prev) * 100))
  const revDelta = pct(kpis.revenueThisWeek, kpis.revenuePrev)
  const patDelta = pct(kpis.patronsThisWeek, kpis.patronsPrev)

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner space-y-6">
        <AnnouncementBanner announcements={announcements} />
        {!hasLinkedCharacter && <CharacterLinkNudge />}

        {/* Page header */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <TodayDateLabel now={now} />
          </p>
        </div>

        {/* Live now banner */}
        {liveEvent && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.07)] shadow-[0_0_20px_rgba(16,185,129,0.06)]">
            <div className="flex items-center gap-3">
              <span className="xiv-live-dot" />
              <span className="text-[0.72rem] font-bold tracking-[0.12em] text-[var(--success-text)] uppercase">
                Live now
              </span>
              <span className="text-sm text-foreground/80 hidden sm:inline">{liveEvent.title} in progress</span>
            </div>
            <Button asChild variant="outline-blue" size="sm">
              <Link href={`/dashboard/${slug}/live`}>
                View Live <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}

        {/* KPI readouts + action buttons */}
        {canManage && (
          <div className="kpis">
            <Card className="p-4">
              <StatReadout
                label="Revenue this week"
                value={formatGil(kpis.revenueThisWeek)}
                delta={revDelta !== null ? `${revDelta > 0 ? "+" : ""}${revDelta}% vs last` : undefined}
                deltaDirection={revDelta !== null ? (revDelta >= 0 ? "up" : "down") : "neutral"}
                icon={<BarChart3 />}
                iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Patrons this week"
                value={kpis.patronsThisWeek.toLocaleString()}
                delta={patDelta !== null ? `${patDelta > 0 ? "+" : ""}${patDelta}% vs last` : undefined}
                deltaDirection={patDelta !== null ? (patDelta >= 0 ? "up" : "down") : "neutral"}
                icon={<Users />}
                iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Avg attendance"
                value={kpis.avgAttendance}
                subtext="per event"
                icon={<TrendingUp />}
                iconVariant="success"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Upcoming events"
                value={kpis.upcomingCount}
                subtext={
                  nextEvent ? `next ${formatDistanceToNow(nextEvent.startTime, { addSuffix: true })}` : undefined
                }
                icon={<Calendar />}
                iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Followers"
                value={kpis.newFollowers.toLocaleString()}
                icon={<Heart />}
                iconVariant="warning"
              />
            </Card>
          </div>
        )}

        {/* Revenue chart + Next event */}
        {canManage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart */}
            <Card className="lg:col-span-2 overflow-hidden">
              <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
                <BarChart3 className="w-4 h-4 text-[var(--xiv-blue)]" />
                Revenue
                <span className="ml-1 text-xs text-[var(--fg-faint)] font-normal">last {chartData.length} events</span>
                <Link
                  href={`/dashboard/${slug}/analytics`}
                  className="ml-auto text-xs text-[var(--xiv-blue)] hover:underline flex items-center gap-1 font-normal"
                >
                  Analytics <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="p-5">
                {chartData.length > 0 ? (
                  <OverviewRevenueChart data={chartData} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No event data yet</p>
                )}
              </div>
            </Card>

            {/* Next event — cinematic card */}
            {nextEvent ? (
              <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden relative flex flex-col justify-between">
                {/* Starfield strip */}
                <div className="absolute top-0 left-0 right-0 h-[88px] overflow-hidden">
                  <div className="absolute inset-0 opacity-20 bg-[url('/starfield.webp')] bg-cover" />
                  <div className="absolute inset-0 ne-gradient" />
                </div>
                <div className="relative p-5 pt-4 flex flex-col gap-3 z-10">
                  {/* Eyebrow */}
                  <div className="flex items-center gap-2">
                    <span className="w-[6px] h-[6px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_8px_rgba(0,180,255,0.5)]" />
                    <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
                      Next event
                    </span>
                  </div>
                  <h3 className="font-cinzel text-xl font-bold tracking-wide leading-tight">{nextEvent.title}</h3>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <LocalTimeRange start={nextEvent.startTime} end={nextEvent.endTime ?? nextEvent.startTime} />
                  </div>
                  {/* Countdown pill */}
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--xiv-blue)] bg-[var(--blue-010)] border border-[var(--blue-020)] px-3 py-1.5 rounded-full w-fit">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDistanceToNow(nextEvent.startTime, { addSuffix: true })}
                  </div>
                </div>
                <div className="px-5 pb-5 flex items-center justify-between gap-3 relative z-10">
                  <Badge variant="tag" className="text-[10px]">
                    {nextEvent.eventType}
                  </Badge>
                  <Button asChild variant="outline-blue" size="sm">
                    <Link href={`/dashboard/${slug}/events/${nextEvent.id}`}>
                      <Cog className="h-3.5 w-3.5" /> Manage
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <Card className="p-5 flex flex-col items-center justify-center gap-2 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No upcoming events</p>
                <Button asChild variant="outline-blue" size="sm">
                  <Link href={`/dashboard/${slug}/events`}>Create one</Link>
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Recent events table + Open tasks */}
        {canManage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Events table */}
            <Card className="lg:col-span-2 overflow-hidden">
              <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
                <Calendar className="w-4 h-4 text-[var(--xiv-blue)]" />
                Recent events
                <Link
                  href={`/dashboard/${slug}/events`}
                  className="ml-auto text-xs text-[var(--xiv-blue)] hover:underline flex items-center gap-1 font-normal"
                >
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[280px] sm:min-w-[380px]">
                  <thead>
                    <tr>
                      <th className="xiv-th text-left">Event</th>
                      <th className="xiv-th text-left hidden sm:table-cell">Date</th>
                      <th className="xiv-th text-right hidden md:table-cell">Attendance</th>
                      <th className="xiv-th text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEventsWithData.length > 0 ? (
                      recentEventsWithData.map((ev) => (
                        <tr
                          key={ev.id}
                          className="border-b border-[var(--blue-008)] last:border-0 hover:bg-[var(--blue-004)] transition-colors"
                        >
                          <td className="px-5 py-3.5 text-[0.86rem]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/dashboard/${slug}/events/${ev.id}`}
                                className="font-medium text-foreground hover:text-[var(--xiv-blue)] transition-colors"
                              >
                                {ev.title}
                              </Link>
                              {ev.status === "ACTIVE" && (
                                <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-[0.03em] bg-[var(--success-soft)] text-[var(--success-text)] border border-[rgba(16,185,129,0.25)]">
                                  Live
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="xiv-td text-muted-foreground whitespace-nowrap tabular-nums hidden sm:table-cell">
                            {format(ev.startTime, "d MMM")}
                          </td>
                          <td className="px-5 py-3.5 text-[0.86rem] text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {ev.patrons > 0 ? ev.patrons : <span className="text-[var(--fg-faint)]">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums font-[var(--font-outfit)] font-semibold text-[0.86rem]">
                            {ev.revenue > 0 ? (
                              `${ev.revenue.toLocaleString()} gil`
                            ) : (
                              <span className="text-[var(--fg-faint)] font-normal">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted-foreground">
                          No events yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Open tasks */}
            <Card className="p-5">
              {openTasks.length > 0 ? (
                <OverviewTasks
                  tasks={openTasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    dueDate: t.dueDate ? format(t.dueDate, "d MMM") : null,
                    priority: t.priority,
                  }))}
                  venueSlug={slug}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-4">
                  <p className="stat-label">Open tasks</p>
                  <p className="text-sm text-muted-foreground">All clear</p>
                  <Button asChild variant="outline-blue" size="sm">
                    <Link href={`/dashboard/${slug}/tasks`}>View tasks</Link>
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* My shifts (all roles) */}
        {myShifts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-[var(--xiv-blue)]" />
              <span className="text-sm font-semibold">My shifts</span>
              <Link
                href={`/dashboard/${slug}/shifts`}
                className="ml-auto text-xs text-[var(--xiv-blue)] hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {myShifts.map((shift) => (
                <Card
                  key={shift.id}
                  className={`p-4 flex items-center justify-between ${shift.status === "active" ? "border-[rgba(16,185,129,0.3)]" : ""}`}
                >
                  <p className="text-sm">
                    <LocalTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} />
                  </p>
                  <Badge variant={shift.status === "active" ? "status-open" : "tag"}>
                    {shift.status === "active" ? "On Shift" : "Upcoming"}
                  </Badge>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Staff quick actions */}
        {!canManage && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg
                className="w-4 h-4 text-[var(--xiv-blue)]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="text-sm font-semibold">Quick actions</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { href: `/dashboard/${slug}/sales`, icon: BarChart3, label: "Log a Sale" },
                { href: `/dashboard/${slug}/shifts`, icon: Radio, label: "My Shifts" },
                { href: `/dashboard/${slug}/tasks`, icon: Users, label: "Tasks" },
              ].map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}>
                  <Card className="p-4 flex items-center gap-3 cursor-pointer">
                    <div className="h-8 w-8 rounded-lg bg-[var(--blue-010)] flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-[var(--xiv-blue)]" />
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
