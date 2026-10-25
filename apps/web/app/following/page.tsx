import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Following",
  description: "Venues you follow across the realm.",
}
import { FollowingClient } from "@/components/following-client"
import { ExploreLayout } from "@/components/explore-layout"
import {
  getPublicEventsForIds,
  getPublicHoursForVenues,
  getPublicVenuesForIds,
  listMyFollows,
  type FollowRow,
  type PublicEvents,
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

  // xvm-api is the source of truth for a followed venue's profile, hours and
  // events. Following is capped at 200 by /me/follows, and each helper chunks
  // the ids into batches of 50 and merges them - one request per 50 followed
  // venues rather than one per venue. Failed reads show closed (unless a live
  // event is running). A deactivated venue is absent from the profile read and
  // is left out.
  let hoursByVenue: Record<string, PublicHours> = {}
  let profileByVenue: Record<string, PublicVenue> = {}
  let eventsByVenue: Record<string, PublicEvents> = {}
  if (followedXvmIds.length > 0) {
    try {
      hoursByVenue = await getPublicHoursForVenues(followedXvmIds)
    } catch {
      hoursByVenue = {}
    }
    profileByVenue = await getPublicVenuesForIds(followedXvmIds)
    eventsByVenue = await getPublicEventsForIds(followedXvmIds)
  }

  // Follows come newest first.
  const venues = follows.flatMap((f) => {
    const profile = profileByVenue[f.venue_id]
    if (!profile) return []
    const liveEvent = eventsByVenue[f.venue_id]?.live ?? null
    return [
      {
        id: profile.id,
        name: profile.name,
        slug: profile.slug,
        dataCenter: profile.data_center,
        world: profile.world,
        district: profile.district,
        ward: profile.ward,
        plot: profile.plot,
        apartment: profile.room,
        followCount: profile.follower_count,
        isOpenNow: liveEvent !== null || (hoursByVenue[f.venue_id]?.open_now.open ?? false),
        activeEvent: liveEvent ? { title: liveEvent.title } : null,
      },
    ]
  })

  return (
    <ExploreLayout>
      <FollowingClient venues={venues} followCount={venues.length} />
    </ExploreLayout>
  )
}
