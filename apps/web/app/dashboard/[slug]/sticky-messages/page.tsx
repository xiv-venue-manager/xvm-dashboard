import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { StickiesBoard } from "@/components/stickies-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listStickies, type StickyRow } from "@/lib/api/xvm-api"

export default async function StickyMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let stickies: StickyRow[] = []
  let loadFailed = false
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      stickies = await listStickies(token, venue.id)
    } catch (err) {
      loadFailed = true
      console.error("[sticky-messages page] read error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  } else {
    loadFailed = true
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner max-w-6xl">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Sticky Messages</h1>
        </div>

        {loadFailed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the sticky messages. Try reloading the page.</p>
        ) : (
          <StickiesBoard venueId={venue.id} canManage={["OWNER", "MANAGER"].includes(userRole)} stickies={stickies} />
        )}
      </div>
    </VenueLayout>
  )
}
