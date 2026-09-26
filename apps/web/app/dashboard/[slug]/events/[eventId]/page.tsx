import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayout } from "@/components/venue-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"
import { DeleteEventButton } from "@/components/delete-event-button"
import { CancelSeriesButton } from "@/components/cancel-series-button"
import { LocalTime } from "@/components/server-time"
import { extractPartakeImages, extractPartakeTextBody } from "@/lib/discord-webhook"
import { renderPartakeProse } from "@/lib/render-partake-prose"
import { formatVenueLocationShort } from "@/lib/venue-location"
import { eventHiddenFromStaff } from "@/lib/event-visibility"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getEvent } from "@/lib/api/xvm-api"
import { creatorNameOf } from "@/lib/api/event-creator"
import { toDashboardEventShape } from "@/lib/api/event-shape"

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

export default async function EventDetailsPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug, eventId } = await params

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

  if (!/^\d+$/.test(eventId)) {
    notFound()
  }

  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const event = await readXvm("event-detail", null, async (token, xvmApiVenueId) => {
    const row = await getEvent(token, xvmApiVenueId, Number(eventId))
    return toDashboardEventShape(row, { creatorName: await creatorNameOf(token, xvmApiVenueId, row) })
  })

  if (!event) {
    notFound()
  }

  const userRole = venue.memberships[0].role
  if (await eventHiddenFromStaff(session.user.id, userRole, venue, event.status === "DRAFT" ? "DRAFT" : "PUBLISHED")) {
    notFound()
  }
  const canEdit = ["OWNER", "MANAGER"].includes(userRole)

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold mb-2 break-words">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className={statusColors[event.status as keyof typeof statusColors]}>{event.status}</Badge>
              <Badge variant="outline">{typeLabels[event.eventType as keyof typeof typeLabels]}</Badge>
              {event.partakeEventId && (
                <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">
                  Partake
                </Badge>
              )}
              {event.recurrenceRuleId !== null && (
                <Badge variant="outline" className="border-[rgba(0,180,255,0.25)] text-[var(--fg-subtle)]">
                  ↻ Recurring
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {event.partakeEventId ? "Synced from Partake.gg" : event.createdBy ? `Created by ${event.createdBy.name}` : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/${slug}/events`}>← Back</Link>
            </Button>
            {canEdit && (
              <>
                <Button size="sm" asChild>
                  <Link href={`/dashboard/${slug}/events/${eventId}/edit`}>Edit</Link>
                </Button>
                {event.recurrenceRuleId !== null && (
                  <CancelSeriesButton venueId={venue.id} eventId={eventId} venueSlug={slug} />
                )}
                <DeleteEventButton venueId={venue.id} eventId={eventId} venueSlug={slug} />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Location */}
            {event.location && (
              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">📍 {event.location}</p>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            {(() => {
              const flyers = extractPartakeImages(event.description)
              const textBody = extractPartakeTextBody(event.description)
              const hasContent = flyers.length > 0 || textBody.length > 0
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>Event Description</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {textBody && (
                      <div className="whitespace-pre-wrap leading-relaxed">{renderPartakeProse(textBody)}</div>
                    )}
                    {flyers.length > 0 && (
                      <div className="space-y-3">
                        {flyers.map((src, i) => (
                          <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt={`Flyer ${i + 1}`}
                              className="w-full rounded-md border border-white/10 hover:opacity-90 transition"
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {!hasContent && <p className="text-muted-foreground">No description provided</p>}
                  </CardContent>
                </Card>
              )
            })()}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Date & Time */}
            <Card>
              <CardHeader>
                <CardTitle>Date & Time</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Start</p>
                  <p className="font-semibold">
                    <LocalTime date={event.startTime} formatStr="datelong" />
                  </p>
                  <p className="text-sm">
                    <LocalTime date={event.startTime} formatStr="time" />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">End</p>
                  <p className="font-semibold">
                    <LocalTime date={event.endTime} formatStr="datelong" />
                  </p>
                  <p className="text-sm">
                    <LocalTime date={event.endTime} formatStr="time" />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timezone</p>
                  <p className="text-sm">{event.timezone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Partake Source */}
            {event.partakeEventId && (
              <Card className="border-[rgba(0,180,255,0.2)] bg-[rgba(0,180,255,0.05)]">
                <CardHeader>
                  <CardTitle className="text-sm">Synced from Partake</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Partake Event ID</p>
                    <p className="text-sm font-mono">{event.partakeEventId}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This event was automatically imported from Partake.gg and syncs hourly.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Venue Info */}
            <Card>
              <CardHeader>
                <CardTitle>Venue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{venue.name}</p>
                <p className="text-sm text-muted-foreground">
                  {venue.world} ({venue.dataCenter})
                </p>
                {formatVenueLocationShort(venue) && (
                  <p className="text-sm text-muted-foreground mt-2">📍 {formatVenueLocationShort(venue)}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </VenueLayout>
  )
}
