import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { roleInVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { HoursBoard } from "@/components/hours-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listHours, type HoursRow } from "@/lib/api/xvm-api"

export default async function HoursPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({ where: { slug } })

  const userRole = venue ? await roleInVenue(session.user.id, venue) : null
  if (!venue || !userRole) notFound()


  let hours: HoursRow[] = []
  let loadFailed = false
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      hours = await listHours(token, venue.xvmApiVenueId)
    } catch (err) {
      loadFailed = true
      console.error("[hours page] listHours error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  } else if (!notConnected) {
    loadFailed = true
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Hours</h1>
        </div>

        <HoursBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          hours={hours}
          notConnected={notConnected}
          loadFailed={loadFailed}
          venueTimezone={venue.timezone}
        />
      </div>
    </VenueLayout>
  )
}
