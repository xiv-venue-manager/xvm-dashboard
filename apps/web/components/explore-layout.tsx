import { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { myVenues } from "@/lib/api/venue-access"
import { cookies } from "next/headers"
import { VenueSidebar } from "./venue-sidebar"

export async function ExploreLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  let venueSlug = ""
  let venueName = ""
  let userRole = "STAFF"
  let venues: Array<{ id: string; name: string; slug: string; dataCenter: string; world: string }> = []

  if (session?.user?.id) {
    // Read last-active venue from cookie set by VenueLayout/VenueLayoutClient
    const cookieStore = await cookies()
    const activeSlug = cookieStore.get("xiv-active-venue")?.value

    const mine = await myVenues(session.user.id).catch(() => [])
    venues = mine.map(({ id, name, slug, dataCenter, world }) => ({ id, name, slug, dataCenter, world }))

    // Prefer cookie (last visited dashboard venue), fall back to the first venue
    const current = (activeSlug ? mine.find((v) => v.slug === activeSlug) : null) ?? mine[0]

    if (current) {
      venueSlug = current.slug
      venueName = current.name
      userRole = current.role
    }
  }

  return (
    <div className="relative min-h-screen">
      {venueSlug && (
        <VenueSidebar
          venueSlug={venueSlug}
          venueName={venueName}
          userRole={userRole}
          userName={session?.user?.name || undefined}
          userEmail={session?.user?.email || undefined}
          venues={venues}
        />
      )}
      <main className={`${venueSlug ? "[@media(min-width:1081px)]:ml-[300px]" : ""} relative z-[1]`}>{children}</main>
    </div>
  )
}
