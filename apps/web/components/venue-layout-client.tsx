"use client"

import { ReactNode, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { VenueSidebar } from "./venue-sidebar"
import { useVenues } from "./venue-context"
import { ActiveVenueTracker } from "./active-venue-tracker"

interface VenueLayoutClientProps {
  children: ReactNode
  slug: string
}

const PAGE_LABELS: Record<string, string> = {
  "": "Overview",
  analytics: "Analytics",
  live: "Live Mode",
  events: "Events",
  staff: "Staff",
  shifts: "Shifts",
  tasks: "Tasks",
  services: "Services",
  sales: "Sales",
  payroll: "Payroll",
  timeline: "Timeline",
  "patron-logs": "Patron Logs",
  settings: "Settings",
}

export function VenueLayoutClient({ children, slug }: VenueLayoutClientProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { venues, hasFetched, isLoading, getVenueBySlug, refetchVenues } = useVenues()
  const venue = slug ? getVenueBySlug(slug) : undefined
  const venueData = venue && venue.memberships?.[0] ? { name: venue.name, role: venue.memberships[0].role } : null
  const venueMissing = Boolean(slug) && hasFetched && !isLoading && !venueData
  const refetchedForSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!venueMissing || refetchedForSlug.current === slug) return
    refetchedForSlug.current = slug
    refetchVenues()
  }, [venueMissing, slug, refetchVenues])

  // Set page title dynamically based on current route
  useEffect(() => {
    if (!pathname) return
    const parts = pathname.split("/")
    const pageKey = parts[3] ?? ""
    const label = PAGE_LABELS[pageKey] ?? ""
    document.title = label ? `${label} — XIV Venue Manager` : "XIV Venue Manager"
  }, [pathname])

  if (!venueData) {
    return <div className="[@media(min-width:1081px)]:ml-[300px] relative z-[1]">{children}</div>
  }

  return (
    <div className="relative min-h-screen">
      <ActiveVenueTracker slug={slug} />
      <VenueSidebar
        venueSlug={slug}
        venueName={venueData.name}
        userRole={venueData.role}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      <main className="[@media(min-width:1081px)]:ml-[300px] relative z-[1]">{children}</main>
    </div>
  )
}
