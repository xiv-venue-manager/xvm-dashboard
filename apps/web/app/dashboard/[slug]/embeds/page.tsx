import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { EmbedsBoard } from "@/components/embeds-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listEmbeds, type EmbedRow } from "@/lib/api/xvm-api"

export default async function EmbedsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let embeds: EmbedRow[] = []
  let loadFailed = false
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      embeds = await listEmbeds(token, venue.id)
    } catch (err) {
      loadFailed = true
      console.error("[embeds page] read error:", err)
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
          <h1 className="page-h1">Embeds</h1>
        </div>

        {loadFailed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the embeds. Try reloading the page.</p>
        ) : (
          <EmbedsBoard venueId={venue.id} canManage={["OWNER", "MANAGER"].includes(userRole)} embeds={embeds} />
        )}
      </div>
    </VenueLayout>
  )
}
