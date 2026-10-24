import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Following",
  description: "Venues you follow across the realm.",
}
import { prisma } from "@/lib/prisma"
import { FollowingClient } from "@/components/following-client"
import { ExploreLayout } from "@/components/explore-layout"
import {
  getPublicHoursForVenues,
  getPublicVenuesForIds,
  listMyFollows,
  type FollowRow,
  type PublicHours,
  type PublicVenue,
} from "@/lib/api/xvm-api"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"

export const dynamic = "force-dynamic"

export default async function FollowingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const readPerson = await xvmPersonReader(session.user.id)
  const follows = await readPerson("following list", [] as FollowRow[], (token) => listMyFollows(token))
  const followedXvmIds = follows.map((f) => f.venue_id)

  const venueRows =
    followedXvmIds.length > 0
      ? await prisma.venue.findMany({
          where: { xvmApiVenueId: { in: followedXvmIds }, isActive: true },
          select: {
            id: true,
            slug: true,
            dataCenter: true,
            world: true,
            xvmApiVenueId: true,
            events: {
              where: { status: "ACTIVE" },
              take: 1,
              select: { title: true },
            },
          },
        })
      : []
  const venueByXvmId = new Map(venueRows.map((v) => [v.xvmApiVenueId, v]))

  // xvm-api is the source of truth for a connected venue's hours. Following is
  // capped at 200 by /me/follows, and getPublicHoursForVenues chunks the ids
  // into batches of 50 and merges them - one request per 50 followed venues
  // rather than one per venue. Failed reads show closed (unless a live event
  // is running) - Prisma no longer computes hours.
  let hoursByVenue: Record<string, PublicHours> = {}
  let profileByVenue: Record<string, PublicVenue> = {}
  if (followedXvmIds.length > 0) {
    try {
      hoursByVenue = await getPublicHoursForVenues(followedXvmIds)
    } catch {
      hoursByVenue = {}
    }
    profileByVenue = await getPublicVenuesForIds(followedXvmIds)
  }

  // Follows come newest first; a follow whose venue has no Prisma row yet is left out.
  const venues = follows.flatMap((f) => {
    const venue = venueByXvmId.get(f.venue_id)
    if (!venue) return []
    const xvmHoursEntry = hoursByVenue[f.venue_id]
    const xvmProfile = profileByVenue[f.venue_id]
    return [
      {
        id: venue.id,
        name: xvmProfile?.name ?? venue.slug,
        slug: venue.slug,
        dataCenter: venue.dataCenter,
        world: venue.world,
        district: xvmProfile?.district ?? null,
        ward: xvmProfile?.ward ?? null,
        plot: xvmProfile?.plot ?? null,
        apartment: xvmProfile?.room ?? null,
        followCount: xvmProfile?.follower_count ?? 0,
        isOpenNow: venue.events.length > 0 || (xvmHoursEntry?.open_now.open ?? false),
        activeEvent: venue.events[0] ?? null,
      },
    ]
  })

  return (
    <ExploreLayout>
      <FollowingClient venues={venues} followCount={venues.length} />
    </ExploreLayout>
  )
}
