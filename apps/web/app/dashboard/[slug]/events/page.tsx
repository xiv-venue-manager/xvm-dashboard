import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"
import { Prisma, EventStatus } from "@/generated/prisma/client"
import { EventsCalendar } from "@/components/events-calendar"
import { VenueLayout } from "@/components/venue-layout"
import { LocalTime } from "@/components/server-time"
import { format } from "date-fns"
import { SyncPartakeButton } from "@/components/sync-partake-button"
import { EndEventButton } from "@/components/end-event-button"
import { canManageVenue } from "@/lib/roles"
import { eventVisibilityFor } from "@/lib/event-visibility"

const statusColors = {
  DRAFT: "bg-zinc-500",
  PUBLISHED: "bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500",
  COMPLETED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  CANCELLED: "bg-red-500",
}

const typeLabels = {
  PERFORMANCE: "Performance",
  GAME_NIGHT: "Game Night",
  SPECIAL: "Special Event",
  SOCIAL: "Social",
  PRIVATE: "Private",
  OTHER: "Other",
}

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string; view?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug } = await params
  const { status, view = "list" } = await searchParams

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

  // Build where clause — drafts view filters by DRAFT status
  const where: Prisma.EventWhereInput = { venueId: venue.id }
  if (view === "drafts") {
    where.status = EventStatus.DRAFT
  } else if (status) {
    where.status = status as EventStatus
  }

  if (
    venue.memberships[0].role === "STAFF" &&
    (await eventVisibilityFor(session.user.id, venue)) === "published"
  ) {
    where.status = EventStatus.PUBLISHED
  }

  // Get events
  const events = await prisma.event.findMany({
    where,
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { patronLogs: true } },
      parentEvent: { select: { recurrenceRule: true } },
    },
    orderBy: { startTime: "asc" },
  })

  // Separate upcoming, past, and draft events
  const now = new Date()
  const upcomingEvents = events.filter(
    (e: (typeof events)[number]) => new Date(e.startTime) >= now && e.status !== "DRAFT"
  )
  const pastEvents = events.filter((e: (typeof events)[number]) => new Date(e.startTime) < now && e.status !== "DRAFT")
  const draftEvents = events.filter((e: (typeof events)[number]) => e.status === "DRAFT")

  const userRole = venue.memberships[0].role

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
            <h1 className="page-h1">Events</h1>
          </div>
          <div className="flex items-center gap-2 self-start flex-wrap">
            {venue.partakeTeamId && <SyncPartakeButton venueId={venue.id} />}
            {canManageVenue(userRole) && (
              <Button asChild size="sm">
                <Link href={`/dashboard/${slug}/events/new`}>
                  <span className="hidden sm:inline">Create Event</span>
                  <span className="sm:hidden">New</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
            {(
              [
                { key: "list", label: "Upcoming" },
                { key: "past", label: "Past" },
                { key: "drafts", label: `Drafts${draftEvents.length > 0 ? ` (${draftEvents.length})` : ""}` },
                { key: "calendar", label: "Calendar" },
              ] as const
            ).map(({ key, label }) => (
              <Link
                key={key}
                href={`/dashboard/${slug}/events?view=${key}`}
                className={`text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-full transition-colors ${
                  view === key
                    ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {upcomingEvents.length} upcoming · {pastEvents.length} past · {draftEvents.length} drafts
          </span>
        </div>

        {view === "calendar" ? (
          <EventsCalendar events={events} venueSlug={slug} />
        ) : view === "drafts" ? (
          <>
            {draftEvents.length === 0 ? (
              <div className="xiv-card rounded-xl p-8 text-center">
                <p className="text-muted-foreground">
                  No draft events. Drafts are created when you save an event without publishing.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {draftEvents.map((event: (typeof draftEvents)[number]) => (
                  <div
                    key={event.id}
                    className="xiv-card rounded-xl p-4 flex gap-4 transition-all hover:border-[rgba(0,180,255,0.4)]"
                  >
                    <div className="w-10 flex-shrink-0 text-center pt-0.5">
                      <div className="text-[0.58rem] font-semibold uppercase tracking-wide text-[var(--fg-faint)]">
                        <LocalTime date={event.startTime} formatStr="monthShort" />
                      </div>
                      <div className="font-cinzel text-xl font-bold leading-none mt-0.5 text-[var(--fg-faint)]">
                        <LocalTime date={event.startTime} formatStr="dayOfMonth" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-3 flex-wrap">
                        <p className="font-semibold truncate text-[var(--fg-subtle)]">{event.title}</p>
                        <div className="flex gap-1.5 shrink-0">
                          <Badge className={statusColors[event.status as keyof typeof statusColors]}>
                            {event.status}
                          </Badge>
                          <Badge variant="outline">{typeLabels[event.eventType as keyof typeof typeLabels]}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <LocalTime date={event.startTime} formatStr="datelong" /> ·{" "}
                        <LocalTime date={event.startTime} formatStr="time" />
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button asChild variant="cta" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}/edit`}>Edit draft</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}`}>Preview</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : view === "past" ? (
          <>
            {pastEvents.length === 0 ? (
              <div className="xiv-card rounded-xl p-8 text-center">
                <p className="text-muted-foreground">No past events yet.</p>
              </div>
            ) : (
              (() => {
                const grouped = pastEvents.reduce((acc: Record<string, typeof pastEvents>, event) => {
                  const key = format(new Date(event.startTime), "MMMM yyyy")
                  if (!acc[key]) acc[key] = []
                  acc[key].push(event)
                  return acc
                }, {})
                return (
                  <div className="space-y-8">
                    {Object.entries(grouped).map(([month, monthEvents]) => (
                      <div key={month}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xs font-semibold text-[var(--xiv-blue)] uppercase tracking-widest">
                            {month}
                          </span>
                          <div className="flex-1 h-px bg-[rgba(0,180,255,0.15)]" />
                          <span className="text-xs text-muted-foreground">{monthEvents.length}</span>
                        </div>
                        <div className="panel">
                          {monthEvents.map((event: (typeof pastEvents)[number]) => (
                            <div
                              key={event.id}
                              className="border-b border-[var(--blue-008)] last:border-b-0 hover:bg-[var(--blue-004)] transition-colors"
                            >
                              <div className="event-row opacity-75 hover:opacity-100 transition-opacity">
                                <Link
                                  href={`/dashboard/${slug}/events/${event.id}`}
                                  className="flex items-center gap-[18px] flex-1 min-w-0"
                                >
                                  <div className="datebox off">
                                    <div className="mo">
                                      <LocalTime date={event.startTime} formatStr="monthShort" />
                                    </div>
                                    <div className="dy">
                                      <LocalTime date={event.startTime} formatStr="dayOfMonth" />
                                    </div>
                                  </div>
                                  <div className="ev-mid">
                                    <div className="ev-title">{event.title}</div>
                                    <div className="ev-sub">
                                      <span className="meta">
                                        <LocalTime date={event.startTime} formatStr="time" />
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                                <div className="ev-right">
                                  <Badge className={statusColors[event.status as keyof typeof statusColors]}>
                                    {event.status}
                                  </Badge>
                                  {event.status === "ACTIVE" && canManageVenue(userRole) && (
                                    <EndEventButton venueId={venue.id} eventId={event.id} />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </>
        ) : (
          <>
            {/* Upcoming Events */}
            <div className="mb-8">
              {upcomingEvents.length === 0 ? (
                <div className="xiv-card rounded-xl p-8 text-center">
                  <p className="text-muted-foreground">No upcoming events. Check back soon or ask your manager.</p>
                </div>
              ) : (
                <div className="panel">
                  {upcomingEvents.map((event: (typeof upcomingEvents)[number]) => (
                    <div
                      key={event.id}
                      className="event-row border-b border-[var(--blue-008)] last:border-b-0 hover:bg-[var(--blue-004)] transition-colors"
                    >
                      <div className="datebox">
                        <div className="mo">
                          <LocalTime date={event.startTime} formatStr="monthShort" />
                        </div>
                        <div className="dy">
                          <LocalTime date={event.startTime} formatStr="dayOfMonth" />
                        </div>
                      </div>
                      <div className="ev-mid">
                        <div className="ev-title">
                          {event.title}
                          <Badge className={statusColors[event.status as keyof typeof statusColors]}>
                            {event.status}
                          </Badge>
                          <Badge variant="outline">{typeLabels[event.eventType as keyof typeof typeLabels]}</Badge>
                          {event.partakeEventId && (
                            <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">
                              Partake
                            </Badge>
                          )}
                          {(event.recurrenceRule || event.parentEventId) && (
                            <Badge variant="outline" className="border-[rgba(0,180,255,0.25)] text-[var(--fg-subtle)]">
                              ↻ Recurring
                            </Badge>
                          )}
                        </div>
                        <div className="ev-sub">
                          <span className="meta">
                            {format(new Date(event.startTime), "EEE")} ·{" "}
                            <LocalTime date={event.startTime} formatStr="time" />
                            {event.endTime && (
                              <>
                                {" "}
                                – <LocalTime date={event.endTime} formatStr="time" />
                              </>
                            )}
                          </span>
                          {(event.attendanceCount || event.partakeAttendeeCount || event._count.patronLogs > 0) && (
                            <span className="meta">
                              {event.attendanceCount
                                ? `${event.attendanceCount} attended`
                                : event.partakeAttendeeCount
                                  ? `${event.partakeAttendeeCount} RSVP via Partake`
                                  : `${event._count.patronLogs} patron logs`}
                            </span>
                          )}
                          {event.location && <span className="meta truncate max-w-[200px]">{event.location}</span>}
                        </div>
                      </div>
                      <div className="ev-right">
                        {event.status === "ACTIVE" && canManageVenue(userRole) && (
                          <EndEventButton venueId={venue.id} eventId={event.id} />
                        )}
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}`}>View</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}/edit`}>Edit</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </VenueLayout>
  )
}
