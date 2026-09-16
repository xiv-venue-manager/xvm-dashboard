"use client"

import { useState } from "react"
import Link from "next/link"
import { MapPin, ArrowRight, Heart, Radio, Moon, Building2, Users } from "lucide-react"
import { VenueFollowButton } from "@/components/venue-follow-button"
import { formatVenueAddress } from "@/lib/venue-location"

export type DiscoverVenue = {
  id: string
  name: string
  slug: string
  dataCenter: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  apartment: number | null
  location: string | null
  description: string | null
  followCount: number
  isFollowed: boolean
  isOpenNow: boolean
  isTonightOpen: boolean
  activeEvent: { title: string } | null
  upcomingEvent: { title: string; startTime: string } | null
}

type Tab = "open" | "tonight" | "all"

export function DiscoverClient({
  venues,
  isAuthed,
  totalCount,
}: {
  venues: DiscoverVenue[]
  isAuthed: boolean
  totalCount: number
}) {
  const [tab, setTab] = useState<Tab>("open")
  const [search, setSearch] = useState("")

  const openCount = venues.filter((v) => v.isOpenNow).length
  const tonightCount = venues.filter((v) => v.isTonightOpen).length

  const filtered = venues.filter((v) => {
    if (tab === "open" && !v.isOpenNow) return false
    if (tab === "tonight" && !v.isTonightOpen) return false
    if (search) {
      const q = search.toLowerCase()
      return [v.name, v.dataCenter, v.world, v.district ?? "", v.location ?? ""].join(" ").toLowerCase().includes(q)
    }
    return true
  })

  const daySeed = Math.floor(Date.now() / 86_400_000)
  const featured = filtered.find((v) => v.isOpenNow || v.isTonightOpen) ?? filtered[daySeed % filtered.length]
  const rest = filtered.filter((v) => v.id !== featured?.id)
  const restOpen = rest.filter((v) => v.isOpenNow).length
  const restClosed = rest.filter((v) => !v.isOpenNow).length

  const tabs = [
    { key: "open" as Tab, icon: <Radio className="w-3.5 h-3.5" />, label: "Open now" },
    { key: "tonight" as Tab, icon: <Moon className="w-3.5 h-3.5" />, label: "Tonight" },
    { key: "all" as Tab, icon: null, label: "All" },
  ]

  return (
    <div className="page-inner" style={{ maxWidth: 940 }}>
      {/* Page header */}
      <div className="head-row">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Discover
            </span>
          </div>
          <h1 className="page-h1">Find a venue tonight</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-[560px]">
            Roleplay taverns, lounges and clubs open across the realm right now.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-[14px] mt-[30px] mb-3 flex-wrap">
        <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
          {tabs.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-[7px] text-[0.85rem] font-semibold px-4 py-[7px] rounded-full transition-colors ${
                tab === key
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative flex items-center">
          <svg
            className="absolute left-[14px] w-4 h-4 text-[var(--fg-faint)] pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search venues, worlds, tags…"
            className="w-full bg-[var(--card)] border border-[var(--blue-015)] rounded-[var(--radius-md)] py-[10px] pl-10 pr-[14px] text-[0.88rem] text-foreground placeholder:text-[var(--fg-faint)] outline-none focus:border-[var(--blue-035)] transition-colors"
          />
        </div>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-16">
          {tab === "open"
            ? "No venues open right now."
            : tab === "tonight"
              ? "No venues scheduled tonight."
              : "No venues found."}
          {search && (
            <button className="ml-2 text-[var(--xiv-blue)] hover:underline text-sm" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
        </p>
      )}

      {/* Featured */}
      {featured && (
        <>
          <div className="section-label">
            <span className="sl-label">Featured tonight</span>
            <span className="ln" />
          </div>
          <FeaturedCard venue={featured} isAuthed={isAuthed} />
        </>
      )}

      {/* Browse list */}
      {rest.length > 0 && (
        <>
          <div className="section-label">
            <span className="sl-label muted">All venues</span>
            <span className="ln" />
            <span className="count">
              {restOpen > 0 ? `${restOpen} open` : ""}
              {restOpen > 0 && restClosed > 0 ? " · " : ""}
              {restClosed > 0 ? `${restClosed} closed` : ""}
            </span>
          </div>
          <div className="space-y-2">
            {rest.map((v) => (
              <VenueC3Card key={v.id} venue={v} dimmed={!v.isOpenNow && !v.isTonightOpen} isAuthed={isAuthed} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FeaturedCard({ venue, isAuthed }: { venue: DiscoverVenue; isAuthed: boolean }) {
  return (
    <div className="vcard featured c4 rounded-xl border border-[var(--blue-018)] overflow-hidden relative">
      {/* HUD banner */}
      <div className="absolute inset-x-0 top-0 h-[116px] overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url('/starfield.webp')" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(0,180,255,0.05), var(--card) 92%)" }}
        />
      </div>

      {/* Head */}
      <div className="relative z-[1] flex gap-[18px] px-7 pt-6 pb-[18px] items-start">
        <div className="iconbadge w-16 h-16 flex-shrink-0 rounded-[var(--radius-lg)] grid place-items-center">
          <Building2 className="w-[30px] h-[30px]" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="vname text-[clamp(1.5rem,2.2vw,1.85rem)]">{venue.name}</div>
          <div className="font-mono text-[0.8rem] text-[var(--xiv-blue)] mt-[7px]">{formatVenueAddress(venue)}</div>
        </div>
        <div className="flex flex-col items-end gap-[10px] flex-shrink-0">
          {venue.isOpenNow ? (
            <span className="status open">
              <span className="dot" />
              Open
            </span>
          ) : venue.isTonightOpen ? (
            <span className="status soon">
              <span className="dot" />
              Soon
            </span>
          ) : (
            <span className="status closed">
              <span className="dot" />
              Closed
            </span>
          )}
          <span className="text-[0.78rem] text-muted-foreground flex items-center gap-1.5">
            <Heart className="h-[14px] w-[14px] text-[var(--support-pink)]" />
            {venue.followCount.toLocaleString("en-US")} following
          </span>
        </div>
      </div>

      {/* Crystal divider */}
      <div className="flex items-center gap-[10px] px-7">
        <div className="flex-1 h-px bg-[var(--blue-008)]" />
        <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45" />
        <div className="flex-1 h-px bg-[var(--blue-008)]" />
      </div>

      {/* Readouts */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 my-[18px] border-t border-b border-[var(--blue-008)]"
        style={{ gap: "1px", background: "var(--blue-008)" }}
      >
        {[
          { k: "Tonight", v: venue.activeEvent?.title ?? venue.upcomingEvent?.title ?? "—", blue: true },
          { k: "Followers", v: venue.followCount.toLocaleString("en-US") },
          { k: "Status", v: venue.isOpenNow ? "Live" : venue.isTonightOpen ? "Opening soon" : "Closed" },
          { k: "Data Centre", v: venue.dataCenter },
        ].map(({ k, v, blue }) => (
          <div key={k} className="bg-[var(--card)] px-7 py-[15px]">
            <div className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--fg-faint)] font-semibold">{k}</div>
            <div
              className={`font-[var(--font-outfit)] font-semibold text-[1rem] mt-[6px] ${blue ? "text-[var(--xiv-blue)]" : ""}`}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 px-7 pb-[26px] flex-wrap">
        <div className="tags flex flex-wrap gap-[7px]">
          {venue.description && (
            <span className="tag">
              {venue.description.slice(0, 30)}
              {venue.description.length > 30 ? "…" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-[10px]">
          {isAuthed && (
            <VenueFollowButton venueId={venue.id} isFollowing={venue.isFollowed} followCount={venue.followCount} />
          )}
          <Link
            href={`/venues/${venue.slug}`}
            className="btn-primary flex items-center gap-2 px-[18px] py-[10px] rounded-[var(--radius-md)] text-[0.9rem] font-semibold text-[var(--xiv-navy)] bg-[var(--xiv-blue)] hover:brightness-110 transition-all xiv-btn-shimmer"
          >
            Visit Venue <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function VenueC3Card({ venue, dimmed, isAuthed }: { venue: DiscoverVenue; dimmed?: boolean; isAuthed: boolean }) {
  const isOpen = venue.isOpenNow
  const isSoon = venue.isTonightOpen && !venue.isOpenNow

  return (
    <div className={`vcard c3 flex items-center gap-4 px-[18px] py-4 ${dimmed ? "opacity-70" : ""}`}>
      <div
        className={`iconbadge flex-shrink-0 rounded-[var(--radius-lg)] w-[54px] h-[54px] grid place-items-center ${dimmed ? "bg-[rgba(108,112,134,0.10)] border-[var(--border)] text-[var(--fg-faint)]" : ""}`}
      >
        <Building2 className="w-[25px] h-[25px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[10px] flex-wrap">
          <span className={`vname text-[1.18rem] ${dimmed ? "text-[var(--fg-subtle)]" : ""}`}>{venue.name}</span>
        </div>
        <div className="flex items-center gap-[18px] mt-[7px] flex-wrap">
          <span className="meta">
            <MapPin className="w-[15px] h-[15px]" />
            {formatVenueAddress(venue)}
          </span>
          {venue.activeEvent && <span className="meta text-[var(--xiv-blue)]">{venue.activeEvent.title}</span>}
        </div>
      </div>
      <div className="flex items-center gap-[10px] flex-shrink-0">
        <div className="flex flex-col items-end gap-[10px]">
          {isOpen ? (
            <span className="status open">
              <span className="dot" />
              Open
            </span>
          ) : isSoon ? (
            <span className="status soon">
              <span className="dot" />
              Soon
            </span>
          ) : (
            <span className="status closed">
              <span className="dot" />
              Closed
            </span>
          )}
          <div className="flex items-center gap-2">
            {isAuthed && (
              <VenueFollowButton
                venueId={venue.id}
                isFollowing={venue.isFollowed}
                followCount={venue.followCount}
                compact
              />
            )}
            <Link
              href={`/venues/${venue.slug}`}
              className="btn btn-outline flex items-center gap-2 px-4 py-[7px] text-[0.85rem] rounded-[var(--radius-md)] border border-[var(--blue-018)] bg-[rgba(7,11,20,0.5)] hover:border-[var(--blue-045)] hover:bg-[var(--blue-007)] transition-colors"
            >
              Visit <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
