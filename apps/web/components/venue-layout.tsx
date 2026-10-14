import { VenueSidebar } from "./venue-sidebar"
import { ActiveVenueTracker } from "./active-venue-tracker"
import { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { myVenues } from "@/lib/api/venue-access"

interface VenueLayoutProps {
  children: ReactNode
  venueSlug: string
  venueName: string
  userRole: string
}

export async function VenueLayout({ children, venueSlug, venueName, userRole }: VenueLayoutProps) {
  const session = await getServerSession(authOptions)

  const venues = session?.user?.id ? await myVenues(session.user.id) : []

  return (
    <div className="relative min-h-screen">
      <ActiveVenueTracker slug={venueSlug} />
      <VenueSidebar
        venueSlug={venueSlug}
        venueName={venueName}
        userRole={userRole}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      {/* margin matches prototype: calc(260px + 20px × 2) = 300px */}
      <main className="[@media(min-width:1081px)]:ml-[300px] relative z-[1]">{children}</main>
    </div>
  )
}
