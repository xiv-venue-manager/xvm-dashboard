"use client"

import { useVenues } from "./venue-context"

export function VenueEyebrow({ slug }: { slug: string }) {
  const { venues } = useVenues()
  const venue = venues.find((v) => v.slug === slug)

  if (!venue) return null

  const parts = [venue.name, venue.dataCenter, venue.world].filter(Boolean)

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
        {parts.join(" · ")}
      </span>
    </div>
  )
}
