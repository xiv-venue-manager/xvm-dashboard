import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { roleInVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { TimelineFeed } from "@/components/timeline-feed"

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const { type } = await searchParams

  const venue = await prisma.venue.findUnique({ where: { slug } })

  const userRole = venue ? await roleInVenue(session.user.id, venue) : null
  if (!venue || !userRole) notFound()

  const initialFilter = type === "sales" || type === "patrons" ? type : "all"

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
          <h1 className="page-h1">Timeline</h1>
          <p className="text-[0.95rem] text-muted-foreground mt-[10px] max-w-[560px] leading-[1.6]">
            A running log of everything that happens at your venue: events, sales, shifts, and milestones.
          </p>
        </div>

        <TimelineFeed venueId={venue.id} initialFilter={initialFilter} />
      </div>
    </VenueLayout>
  )
}
