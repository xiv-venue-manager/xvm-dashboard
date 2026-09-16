import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const venue = await prisma.venue.findUnique({
    where: { slug, isActive: true },
    select: { name: true, description: true, dataCenter: true, world: true, bannerUrl: true },
  })
  if (!venue) return { title: "Venue Not Found" }
  const desc =
    venue.description ??
    `${venue.name} runs on ${venue.world}, ${venue.dataCenter}. Check opening hours and upcoming events.`
  const ogImage = venue.bannerUrl ?? "/og-image.png"
  return {
    title: venue.name,
    description: desc,
    alternates: { canonical: `https://xivvenuemanager.com/venues/${slug}` },
    openGraph: {
      type: "website",
      siteName: "XIV Venue Manager",
      title: `${venue.name} | XIV Venue Manager`,
      description: desc,
      url: `https://xivvenuemanager.com/venues/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: venue.name }],
    },
  }
}
import { format } from "date-fns"
import { MapPin, Calendar, Clock, Crown, Image as ImageIcon, ChevronLeft, Scroll, Heart } from "lucide-react"
import { getServerTimeLabel } from "@/lib/server-time"
import { LocalTime } from "@/components/server-time"
import { formatVenueAddress, formatLifestreamCommand } from "@/lib/venue-location"
import { VenueFollowButton } from "@/components/venue-follow-button"
import { CopyAddressButton, CopyAddressInline } from "@/components/copy-address-button"
import { SiteFooter } from "@/components/site-footer"
import { VenueScheduleDisplay } from "@/components/venue-schedule-display"
import { FfxivvenuesScheduleDisplay } from "@/components/ffxivvenues-schedule-display"
import type { FfxivVenueData } from "@/lib/ffxivvenues"
import { isVenueOpenNow } from "@/lib/schedule-utils"

export default async function VenueProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug, isActive: true },
    include: {
      _count: { select: { follows: true, events: true, memberships: true } },
      events: {
        where: {
          status: { in: ["ACTIVE", "PUBLISHED"] },
          startTime: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        select: { id: true, title: true, startTime: true, endTime: true, status: true, eventType: true },
      },
      scheduleEntries: {
        orderBy: [{ day: "asc" }, { startHour: "asc" }],
      },
      venueSchedule: true,
    },
  })

  if (!venue) notFound()

  const [owner, isFollowing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: venue.ownerId },
      select: { name: true, image: true, createdAt: true },
    }),
    session?.user?.id
      ? prisma.venueFollow.findFirst({ where: { userId: session.user.id, venueId: venue.id } }).then(Boolean)
      : Promise.resolve(false),
  ])

  const liveEvent = venue.events.find((e) => e.status === "ACTIVE")
  const upcomingEvents = venue.events.filter((e) => e.status === "PUBLISHED")
  const isOpen = isVenueOpenNow({
    hasActiveEvent: !!liveEvent,
    scheduleEntries: venue.scheduleEntries,
    ffxivSchedule: venue.venueSchedule?.data,
  })
  const tzLabel = getServerTimeLabel(venue.dataCenter)
  const todayUTCDay = new Date().getUTCDay()
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const address = formatVenueAddress(venue)
  const lifestreamCommand = formatLifestreamCommand(venue)

  // Parse hours from settings
  const s = venue.settings as Record<string, unknown> | null
  const defaultHours = (s?.defaultHours as string | undefined) ?? ""
  const openNights = (s?.openNights as string | undefined) ?? ""

  // Map day abbreviations/names to DAY_NAMES index (0=Sunday)
  const DAY_PATTERNS: [RegExp, number][] = [
    [/\bsun(day)?\b/i, 0],
    [/\bmon(day)?\b/i, 1],
    [/\btue(s(day)?)?\b/i, 2],
    [/\bwed(nesday)?\b/i, 3],
    [/\bthu(rs?(day)?)?\b/i, 4],
    [/\bfri(day)?\b/i, 5],
    [/\bsat(urday)?\b/i, 6],
  ]

  // Detect a "Fri-Sun" / "Fri–Sat" range and expand it
  function expandDayRange(text: string): number[] {
    const rangeMatch = text.match(/(\w+)\s*[-–]\s*(\w+)/)
    if (rangeMatch) {
      const from = DAY_PATTERNS.findIndex(([rx]) => rx.test(rangeMatch[1]))
      const to = DAY_PATTERNS.findIndex(([rx]) => rx.test(rangeMatch[2]))
      if (from !== -1 && to !== -1) {
        const days: number[] = []
        let i = from
        while (true) {
          days.push(i % 7)
          if (i % 7 === to) break
          i++
          if (i - from > 7) break // safety
        }
        return days
      }
    }
    return []
  }

  function parseOpenDays(nights: string): Set<number> | null {
    if (!nights.trim()) return null
    if (/every\s*(night|day)/i.test(nights)) return new Set([0, 1, 2, 3, 4, 5, 6])
    const range = expandDayRange(nights)
    if (range.length > 0) return new Set(range)
    const found = new Set<number>()
    for (const [rx, idx] of DAY_PATTERNS) {
      if (rx.test(nights)) found.add(idx)
    }
    return found.size > 0 ? found : null
  }

  const openDays = parseOpenDays(openNights)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: venue.name,
    description:
      venue.description ?? `${venue.name} is an FFXIV roleplay venue on ${venue.dataCenter} - ${venue.world}.`,
    url: `https://xivvenuemanager.com/venues/${venue.slug}`,
    ...(venue.bannerUrl ? { image: venue.bannerUrl } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: venue.world,
      addressRegion: venue.dataCenter,
      addressCountry: "Virtual",
    },
  }
  // Escape HTML-unsafe chars so venue names can't break out of the JSON-LD block
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\//g, "\\u002f")

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd }} />

      {/* ── Hero banner ── */}
      <section className="profile-hero relative mt-[60px] h-[340px] overflow-hidden border-b border-[var(--blue-008)]">
        {/* BG */}
        {venue.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.bannerUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-[1.05]"
            aria-hidden="true"
          />
        ) : (
          <div className="absolute inset-0 bg-[url('/starfield.webp')] bg-center bg-cover opacity-40 scale-[1.05]" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(7,11,20,0.3) 0%, rgba(7,11,20,0.65) 55%, var(--background) 100%)",
          }}
        />

        {/* Back link — top left */}
        <div className="absolute top-5 left-6 z-10">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] px-3 py-2 rounded-[var(--radius-md)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Discover
          </Link>
        </div>

        {/* Hero content — anchored bottom */}
        <div className="hero-content absolute bottom-0 left-0 right-0 z-10">
          <div className="max-w-[1080px] mx-auto px-8 pb-[26px] flex items-end justify-between gap-6 flex-wrap">
            {/* Identity */}
            <div className="hero-id">
              {isOpen ? (
                <span className="status open mb-[14px] inline-flex">
                  <span className="dot" />
                  Open now
                </span>
              ) : upcomingEvents.length > 0 ? (
                <span className="status soon mb-[14px] inline-flex">
                  <span className="dot" />
                  Opening soon
                </span>
              ) : (
                <span className="status closed mb-[14px] inline-flex">
                  <span className="dot" />
                  Closed
                </span>
              )}
              <h1 className="font-cinzel font-bold text-[clamp(2.2rem,4vw,3.2rem)] tracking-[0.02em] leading-[1.05]">
                {venue.name}
              </h1>
              <div className="font-mono text-[0.86rem] text-[var(--xiv-blue)] mt-3 flex items-center gap-2">
                <MapPin className="w-[15px] h-[15px]" />
                {address}
              </div>
              {/* Tags from settings or eventType */}
              {/* Tags pulled from settings json if present */}
              {(() => {
                const s = venue.settings as Record<string, unknown> | null
                const tags = (s?.tags as string[] | undefined) ?? []
                return tags.length > 0 ? (
                  <div className="tags flex flex-wrap gap-2 mt-[14px]">
                    {tags.map((t) => (
                      <span key={t} className={`tag ${t === "18+" ? "adult" : ""}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null
              })()}
            </div>

            {/* Follow action */}
            <div className="hero-actions flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                {session ? (
                  <VenueFollowButton venueId={venue.id} isFollowing={isFollowing} followCount={venue._count.follows} />
                ) : (
                  <Link
                    href="/auth/signin"
                    className="btn btn-follow flex items-center gap-2 px-5 py-[10px] rounded-[var(--radius-md)] bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-035)] hover:bg-[var(--blue-012)] transition-colors font-semibold text-[0.9rem]"
                  >
                    <Heart className="w-4 h-4" /> Follow
                  </Link>
                )}
                <div className="text-[0.8rem] text-muted-foreground mt-2 text-right">
                  <strong className="text-foreground">{venue._count.follows.toLocaleString("en-US")}</strong> following
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live strip ── */}
      {liveEvent && (
        <div className="live-strip bg-[var(--card)] border-b border-[var(--blue-008)]">
          <div className="max-w-[1080px] mx-auto px-8 py-[14px] flex items-center gap-4 flex-wrap">
            <span className="text-[0.92rem]">
              <strong>{liveEvent.title}</strong>
              {" · "}open until {liveEvent.endTime ? <LocalTime date={liveEvent.endTime} formatStr="time" /> : "late"}
            </span>
            <div className="flex-1" />
            <CopyAddressInline address={lifestreamCommand} />
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <section className="prof-body pt-[44px] pb-[70px]">
        <div className="max-w-[1080px] mx-auto px-8">
          {(() => {
            const hasMain = !!(
              venue.description ||
              upcomingEvents.length > 0 ||
              (venue.galleryImages && venue.galleryImages.length > 0)
            )
            return (
              <div
                className={
                  hasMain
                    ? "prof-grid grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[30px] items-start"
                    : "flex justify-end"
                }
              >
                {/* ── Main column — only render when there's content ── */}
                {hasMain && (
                  <div className="prof-main flex flex-col gap-[34px]">
                    {/* About */}
                    {venue.description && (
                      <div className="about">
                        <div className="block-title">
                          <Scroll /> About
                        </div>
                        <p className="text-[0.96rem] text-[var(--fg-subtle)] leading-[1.7]">{venue.description}</p>
                      </div>
                    )}

                    {/* Upcoming events */}
                    {upcomingEvents.length > 0 && (
                      <div className="upcoming">
                        <div className="block-title">
                          <Calendar /> Upcoming events
                        </div>
                        <div className="events-list panel">
                          {upcomingEvents.map((ev) => (
                            <div key={ev.id} className="event-row border-b border-[var(--blue-008)] last:border-b-0">
                              <div className="datebox">
                                <div className="mo">{format(ev.startTime, "MMM")}</div>
                                <div className="dy">{format(ev.startTime, "d")}</div>
                              </div>
                              <div className="ev-mid">
                                <div className="ev-title">{ev.title}</div>
                                <div className="ev-sub">
                                  <span className="meta">
                                    <Clock />
                                    {format(ev.startTime, "EEE")} · <LocalTime date={ev.startTime} formatStr="time" />
                                    {ev.endTime && (
                                      <>
                                        –<LocalTime date={ev.endTime} formatStr="time" />
                                      </>
                                    )}
                                  </span>
                                  {ev.eventType && <span className="tag">{ev.eventType}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gallery — real images from MinIO */}
                    {venue.galleryImages && venue.galleryImages.length > 0 && (
                      <div className="gallery-block">
                        <div className="block-title">
                          <ImageIcon /> Gallery
                        </div>
                        <div className="gallery">
                          {venue.galleryImages.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="gtile">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`${venue.name} gallery ${i + 1}`}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Side column ── */}
                <div className="prof-side flex flex-col gap-[18px]">
                  {/* Hours */}
                  <div className="dcard">
                    <div className="dh">
                      <Clock /> Hours
                    </div>
                    {venue.scheduleEntries.length > 0 ? (
                      <VenueScheduleDisplay entries={venue.scheduleEntries} />
                    ) : openDays ? (
                      DAY_NAMES.map((day, i) => {
                        const isDayOpen = openDays.has(i)
                        const isToday = i === todayUTCDay
                        return (
                          <div key={day} className={`hours-row${isToday ? " today" : isDayOpen ? "" : " closed"}`}>
                            <span className="day">{day}</span>
                            <span className="hrs">{isDayOpen ? defaultHours || "Open" : "Closed"}</span>
                          </div>
                        )
                      })
                    ) : defaultHours ? (
                      // Has hours but couldn't parse specific days — show a summary row
                      <>
                        <div className="px-5 py-3 text-[0.86rem]">
                          <span className="text-muted-foreground">Hours</span>
                          <span className="float-right font-medium">
                            {defaultHours} {tzLabel}
                          </span>
                        </div>
                        {openNights && (
                          <div className="px-5 pb-3 text-[0.86rem]">
                            <span className="text-muted-foreground">Open</span>
                            <span className="float-right font-medium">{openNights}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <VenueScheduleDisplay entries={[]} />
                    )}
                  </div>

                  {/* ffxivvenues synced schedule */}
                  {venue.venueSchedule && (
                    <FfxivvenuesScheduleDisplay
                      data={venue.venueSchedule.data as FfxivVenueData}
                      syncedAt={venue.venueSchedule.syncedAt}
                    />
                  )}

                  {/* Location */}
                  <div className="dcard">
                    <div className="dh">
                      <MapPin /> Location
                    </div>
                    <div className="loc-block">
                      {[
                        { k: "Data Centre", v: venue.dataCenter },
                        { k: "World", v: venue.world },
                        ...(venue.district ? [{ k: "District", v: venue.district }] : []),
                        ...(venue.ward != null ? [{ k: "Ward", v: String(venue.ward) }] : []),
                        ...(venue.plot != null
                          ? [{ k: "Plot", v: String(venue.plot) }]
                          : venue.apartment != null
                            ? [{ k: "Room", v: String(venue.apartment) }]
                            : []),
                        ...(!venue.district &&
                        venue.ward == null &&
                        venue.plot == null &&
                        venue.apartment == null &&
                        venue.location
                          ? [{ k: "Location", v: venue.location }]
                          : []),
                      ].map(({ k, v }) => (
                        <div key={k} className="loc-line">
                          <span className="lk">{k}</span>
                          <span className="lv">{v}</span>
                        </div>
                      ))}
                      <CopyAddressButton address={lifestreamCommand} />
                    </div>
                  </div>

                  {/* Hosted by */}
                  {owner && (
                    <div className="dcard">
                      <div className="dh">
                        <Crown /> Hosted by
                      </div>
                      <div className="host-row">
                        <div className="av">{owner.name?.charAt(0)?.toUpperCase() ?? "?"}</div>
                        <div>
                          <div className="hn">
                            <Crown />
                            {owner.name ?? "Owner"}
                          </div>
                          <div className="hr">Owner · since {format(owner.createdAt, "yyyy")}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
