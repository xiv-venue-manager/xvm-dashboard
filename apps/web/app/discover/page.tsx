import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DiscoverClient, type DiscoverVenue } from "@/components/discover-client"
import { ExploreLayout } from "@/components/explore-layout"
import { tonightEvents } from "@/lib/api/public-events"
import {
  getPublicEventsForIds,
  getPublicHoursBatch,
  listMyFollows,
  listPublicDirectory,
  PUBLIC_DIRECTORY_PAGE,
  type FollowRow,
  type PublicEvents,
  type PublicHours,
} from "@/lib/api/xvm-api"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"

export const metadata: Metadata = {
  title: "Discover Venues",
  description: "Find FFXIV roleplay venues open tonight across every data centre and world.",
  alternates: { canonical: "https://xivvenuemanager.com/discover" },
}

export const revalidate = 60

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions)
  const now = new Date()

  const venues = await listPublicDirectory({ limit: PUBLIC_DIRECTORY_PAGE })

  const follows: FollowRow[] = session?.user?.id
    ? await (await xvmPersonReader(session.user.id))("discover follows", [], (token) => listMyFollows(token))
    : []
  const followedXvmIds = new Set(follows.map((f) => f.venue_id))

  // xvm-api is the source of truth for hours and events - one batched read
  // each for the whole page (the directory page size stays within the batch
  // cap) rather than one request per venue. Failed reads show closed (unless a
  // live event is running).
  const xvmVenueIds = venues.map((v) => v.id)
  let hoursByVenue: Record<string, PublicHours> = {}
  let eventsByVenue: Record<string, PublicEvents> = {}
  if (xvmVenueIds.length > 0) {
    try {
      hoursByVenue = (await getPublicHoursBatch(xvmVenueIds)).venues
    } catch {
      hoursByVenue = {}
    }
    eventsByVenue = await getPublicEventsForIds(xvmVenueIds)
  }

  const cards: DiscoverVenue[] = venues.map((v) => {
    const { live, upcoming } = tonightEvents(eventsByVenue[v.id], now)
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.data_center,
      world: v.world,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      apartment: v.room,
      description: v.description,
      followCount: v.follower_count,
      isFollowed: followedXvmIds.has(v.id),
      isOpenNow: live !== null || (hoursByVenue[v.id]?.open_now.open ?? false),
      isTonightOpen: live !== null || upcoming !== null,
      activeEvent: live ? { title: live.title } : null,
      upcomingEvent: upcoming ? { title: upcoming.title, startTime: upcoming.starts_at } : null,
    }
  })

  // Sort: open now first, then tonight, then rest
  cards.sort((a, b) => {
    if (a.isOpenNow !== b.isOpenNow) return a.isOpenNow ? -1 : 1
    if (a.isTonightOpen !== b.isTonightOpen) return a.isTonightOpen ? -1 : 1
    return 0
  })

  return (
    <ExploreLayout>
      <DiscoverClient venues={cards} isAuthed={!!session?.user} />
    </ExploreLayout>
  )
}
