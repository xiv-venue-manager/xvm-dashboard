import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { MapPin, ArrowRight, ChevronLeft } from "lucide-react"
import { formatVenueLocationShort } from "@/lib/venue-location"
import { tonightEvents } from "@/lib/api/public-events"
import { getPublicEventsForIds, listPublicDirectory } from "@/lib/api/xvm-api"

export const dynamic = "force-dynamic"

export const DATA_CENTRES = [
  { slug: "chaos", name: "Chaos", region: "Europe" },
  { slug: "light", name: "Light", region: "Europe" },
  { slug: "aether", name: "Aether", region: "North America" },
  { slug: "crystal", name: "Crystal", region: "North America" },
  { slug: "dynamis", name: "Dynamis", region: "North America" },
  { slug: "primal", name: "Primal", region: "North America" },
  { slug: "elemental", name: "Elemental", region: "Japan" },
  { slug: "gaia", name: "Gaia", region: "Japan" },
  { slug: "mana", name: "Mana", region: "Japan" },
  { slug: "meteor", name: "Meteor", region: "Japan" },
  { slug: "materia", name: "Materia", region: "Oceania" },
]

export async function generateMetadata({ params }: { params: Promise<{ dc: string }> }): Promise<Metadata> {
  const { dc } = await params
  const dataCentre = DATA_CENTRES.find((d) => d.slug === dc)
  if (!dataCentre) return {}
  return {
    title: `FFXIV ${dataCentre.name} Venues`,
    description: `Browse FFXIV roleplay venues on ${dataCentre.name} data centre. Find bars, clubs, lounges, and events open tonight on ${dataCentre.name}.`,
    alternates: { canonical: `https://xivvenuemanager.com/discover/${dc}` },
    openGraph: {
      title: `FFXIV ${dataCentre.name} Venues | XIV Venue Manager`,
      description: `Browse FFXIV roleplay venues on ${dataCentre.name} data centre.`,
      url: `https://xivvenuemanager.com/discover/${dc}`,
    },
  }
}

export default async function DataCentrePage({ params }: { params: Promise<{ dc: string }> }) {
  const { dc } = await params
  const dataCentre = DATA_CENTRES.find((d) => d.slug === dc)
  if (!dataCentre) notFound()

  const now = new Date()

  const venues = await listPublicDirectory({ dataCenter: dataCentre.name })
  const eventsByVenue = await getPublicEventsForIds(venues.map((v) => v.id))

  const enriched = venues.map((v) => {
    const { live, upcoming } = tonightEvents(eventsByVenue[v.id], now)
    return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      world: v.world,
      description: v.description,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      apartment: v.room,
      followCount: v.follower_count,
      isOpen: live !== null,
      hasTonight: live !== null || upcoming !== null,
    }
  })

  // Sort: open now first, tonight second, rest alphabetical
  const sorted = [...enriched].sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    if (a.hasTonight !== b.hasTonight) return a.hasTonight ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-4xl">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" /> All data centres
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {dataCentre.region}
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-3">{dataCentre.name} Venues</h1>
          <p className="text-lg text-muted-foreground">
            FFXIV roleplay venues registered on {dataCentre.name}. Follow a venue to get notified when it opens.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {sorted.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-muted-foreground">No venues registered on {dataCentre.name} yet.</p>
            <p className="text-sm text-muted-foreground">
              Running a venue on {dataCentre.name}?{" "}
              <Link href="/guide/getting-started" className="text-[var(--xiv-blue)] hover:underline">
                Register it for free.
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {sorted.length} venue{sorted.length !== 1 ? "s" : ""} on {dataCentre.name}
            </p>

            <div className="grid gap-[18px] sm:grid-cols-2">
              {sorted.map((venue) => {
                const { isOpen, hasTonight } = venue

                return (
                  <Link key={venue.id} href={`/venues/${venue.slug}`} className="block group">
                    <div className="xiv-card rounded-xl p-6 h-full space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-semibold text-[1rem] group-hover:text-[var(--xiv-blue)] transition-colors leading-snug">
                          {venue.name}
                        </h2>
                        {isOpen ? (
                          <span className="status open shrink-0 inline-flex text-xs">
                            <span className="dot" />
                            Open now
                          </span>
                        ) : hasTonight ? (
                          <span className="status soon shrink-0 inline-flex text-xs">
                            <span className="dot" />
                            Opening soon
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>
                          {venue.world}
                          {(() => {
                            const loc = formatVenueLocationShort(venue)
                            return loc ? ` · ${loc}` : ""
                          })()}
                        </span>
                      </div>

                      {venue.description && (
                        <p className="text-[0.85rem] text-muted-foreground leading-[1.5] line-clamp-2">
                          {venue.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-muted-foreground">
                          {venue.followCount} follower{venue.followCount !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-[var(--xiv-blue)] group-hover:underline inline-flex items-center gap-1">
                          View venue <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-14 rounded-xl border border-[rgba(0,180,255,0.2)] bg-[rgba(0,180,255,0.04)] p-8 text-center space-y-4">
          <h2 className="font-cinzel text-xl font-semibold tracking-wide">Running a venue on {dataCentre.name}?</h2>
          <p className="text-[0.9rem] text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Register for free and let patrons find you. Setup takes about five minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
            <Button asChild className="xiv-btn-shimmer xiv-cta font-semibold group">
              <Link href="/venues/new">
                Register your venue
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-[var(--xiv-blue-border)] hover:bg-[var(--xiv-blue-dim)] hover:border-[var(--xiv-blue)]"
            >
              <Link href="/guide/getting-started">How it works</Link>
            </Button>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
