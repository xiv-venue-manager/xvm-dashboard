import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const publicVenue = await getPublicVenueBySlug(slug).catch((err) => {
    if (err instanceof XvmApiError && err.status === 404) return null
    throw err
  })
  if (!publicVenue) return { title: "Venue Not Found" }

  const desc = publicVenue.description ?? `${publicVenue.name} is an FFXIV roleplay venue.`
  const ogImage = publicVenue.banner_url ?? "/og-image.png"
  return {
    title: publicVenue.name,
    description: desc,
    alternates: { canonical: `https://xivvenuemanager.com/venues/${slug}` },
    openGraph: {
      type: "website",
      siteName: "XIV Venue Manager",
      title: `${publicVenue.name} | XIV Venue Manager`,
      description: desc,
      url: `https://xivvenuemanager.com/venues/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: publicVenue.name }],
    },
  }
}
import { format } from "date-fns"
import { MapPin, Calendar, Clock, Image as ImageIcon, ChevronLeft, Scroll, Heart } from "lucide-react"
import { LocalTime } from "@/components/server-time"
import { formatVenueAddress, formatLifestreamCommand } from "@/lib/venue-location"
import { VenueFollowButton } from "@/components/venue-follow-button"
import { CopyAddressButton, CopyAddressInline } from "@/components/copy-address-button"
import { SiteFooter } from "@/components/site-footer"
import { VenueScheduleDisplay } from "@/components/venue-schedule-display"
import { xvmHoursToScheduleEntries } from "@/lib/schedule-utils"
import {
  getPublicEvents,
  getPublicHours,
  getPublicVenueBySlug,
  listMyFollows,
  XvmApiError,
  type FollowRow,
  type PublicEvents,
  type PublicHours,
} from "@/lib/api/xvm-api"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"

export default async function VenueProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  const { slug } = await params

  const venue = await getPublicVenueBySlug(slug).catch((err) => {
    if (err instanceof XvmApiError && err.status === 404) return null
    throw err
  })
  if (!venue) notFound()

  // Hours and events are optional signals: a failed read leaves that section
  // empty rather than failing the page.
  let xvmHours: PublicHours | null = null
  try {
    xvmHours = await getPublicHours(venue.id)
  } catch {
    xvmHours = null
  }
  const scheduleEntries = xvmHours ? xvmHoursToScheduleEntries(xvmHours.rules) : []

  let events: PublicEvents = { live: null, upcoming: [] }
  try {
    events = await getPublicEvents(venue.id)
  } catch {
    events = { live: null, upcoming: [] }
  }

  const displayName = venue.name
  const displayDescription = venue.description
  const displayBannerUrl = venue.banner_url
  const displayImages = venue.images.map((img) => img.image_url)
  const displayLocation = {
    dataCenter: venue.data_center,
    world: venue.world,
    district: venue.district,
    ward: venue.ward,
    plot: venue.plot,
    apartment: venue.room,
    location: null as string | null,
  }

  const isFollowing = session?.user?.id
    ? (
        await (await xvmPersonReader(session.user.id))("venue follow state", [] as FollowRow[], (token) =>
          listMyFollows(token)
        )
      ).some((f) => f.venue_id === venue.id)
    : false
  const followerCount = venue.follower_count

  const liveEvent = events.live
  const upcomingEvents = events.upcoming
  const isOpen = !!liveEvent || (xvmHours?.open_now.open ?? false)
  const address = formatVenueAddress(displayLocation)
  const lifestreamCommand = formatLifestreamCommand(displayLocation)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: displayName,
    description: displayDescription ?? `${displayName} is an FFXIV roleplay venue.`,
    url: `https://xivvenuemanager.com/venues/${venue.slug}`,
    ...(displayBannerUrl ? { image: displayBannerUrl } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: displayLocation.world,
      addressRegion: displayLocation.dataCenter,
      addressCountry: "Virtual",
    },
  }
  // Escape HTML-unsafe chars so venue names can't break out of the JSON-LD block
  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\//g, "\\u002f")

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd }} />

      {/* ── Hero banner ── */}
      <section className="profile-hero relative h-[340px] overflow-hidden border-b border-[var(--blue-008)]">
        {/* BG */}
        {displayBannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayBannerUrl}
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
            background:
              "linear-gradient(180deg, rgba(7,11,20,0.85) 0%, rgba(7,11,20,0.75) 30%, rgba(7,11,20,0.65) 55%, var(--background) 100%)",
          }}
        />

        {/* Back link — top left */}
        <div className="absolute top-5 left-6 z-10">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-foreground hover:bg-[var(--blue-007)] px-3 py-2 rounded-[var(--radius-md)] transition-colors"
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
                {displayName}
              </h1>
              {address && (
                <div className="font-mono text-[0.86rem] text-[var(--xiv-blue)] mt-3 flex items-center gap-2">
                  <MapPin className="w-[15px] h-[15px]" />
                  {address}
                </div>
              )}
              {venue.tags.length > 0 && (
                <div className="tags flex flex-wrap gap-2 mt-[14px]">
                  {venue.tags.map((t) => (
                    <span key={t} className={`tag ${t === "18+" ? "adult" : ""}`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Follow action */}
            <div className="hero-actions flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                {session ? (
                  <VenueFollowButton venueId={venue.id} isFollowing={isFollowing} followCount={followerCount} />
                ) : (
                  <>
                    <Link
                      href="/auth/signin"
                      className="btn btn-follow flex items-center gap-2 px-5 py-[10px] rounded-[var(--radius-md)] bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-035)] hover:bg-[var(--blue-012)] transition-colors font-semibold text-[0.9rem]"
                    >
                      <Heart className="w-4 h-4" /> Follow
                    </Link>
                    <div className="text-[0.8rem] text-muted-foreground mt-2 text-right">
                      <strong className="text-foreground">{followerCount.toLocaleString()}</strong> following
                    </div>
                  </>
                )}
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
              {" · "}open until <LocalTime date={new Date(liveEvent.ends_at)} formatStr="time" />
            </span>
            <div className="flex-1" />
            {lifestreamCommand && <CopyAddressInline address={lifestreamCommand} />}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <section className="prof-body pt-[44px] pb-[70px]">
        <div className="max-w-[1080px] mx-auto px-8">
          {(() => {
            const hasMain = !!(displayDescription || upcomingEvents.length > 0 || displayImages.length > 0)
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
                    {displayDescription && (
                      <div className="about">
                        <div className="block-title">
                          <Scroll /> About
                        </div>
                        <p className="text-[0.96rem] text-[var(--fg-subtle)] leading-[1.7]">{displayDescription}</p>
                      </div>
                    )}

                    {/* Upcoming events */}
                    {upcomingEvents.length > 0 && (
                      <div className="upcoming">
                        <div className="block-title">
                          <Calendar /> Upcoming events
                        </div>
                        <div className="events-list panel">
                          {upcomingEvents.map((ev) => {
                            const start = new Date(ev.starts_at)
                            return (
                              <div
                                key={`${ev.starts_at}-${ev.title}`}
                                className="event-row border-b border-[var(--blue-008)] last:border-b-0"
                              >
                                <div className="datebox">
                                  <div className="mo">{format(start, "MMM")}</div>
                                  <div className="dy">{format(start, "d")}</div>
                                </div>
                                <div className="ev-mid">
                                  <div className="ev-title">{ev.title}</div>
                                  <div className="ev-sub">
                                    <span className="meta">
                                      <Clock />
                                      {format(start, "EEE")} · <LocalTime date={start} formatStr="time" />–
                                      <LocalTime date={new Date(ev.ends_at)} formatStr="time" />
                                    </span>
                                    {ev.event_type && <span className="tag">{ev.event_type}</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Gallery */}
                    {displayImages.length > 0 && (
                      <div className="gallery-block">
                        <div className="block-title">
                          <ImageIcon /> Gallery
                        </div>
                        <div className="gallery">
                          {displayImages.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="gtile">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`${displayName} gallery ${i + 1}`}
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
                    <VenueScheduleDisplay entries={scheduleEntries} />
                  </div>

                  {/* Location */}
                  <div className="dcard">
                    <div className="dh">
                      <MapPin /> Location
                    </div>
                    <div className="loc-block">
                      {[
                        { k: "Data Centre", v: displayLocation.dataCenter },
                        { k: "World", v: displayLocation.world },
                        ...(displayLocation.district ? [{ k: "District", v: displayLocation.district }] : []),
                        ...(displayLocation.ward != null ? [{ k: "Ward", v: String(displayLocation.ward) }] : []),
                        ...(displayLocation.plot != null
                          ? [{ k: "Plot", v: String(displayLocation.plot) }]
                          : displayLocation.apartment != null
                            ? [{ k: "Room", v: String(displayLocation.apartment) }]
                            : []),
                      ].map(({ k, v }) => (
                        <div key={k} className="loc-line">
                          <span className="lk">{k}</span>
                          <span className="lv">{v}</span>
                        </div>
                      ))}
                      {lifestreamCommand && <CopyAddressButton address={lifestreamCommand} />}
                    </div>
                  </div>

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
