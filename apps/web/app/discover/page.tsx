import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DiscoverClient, type DiscoverVenue } from "@/components/discover-client"
import { ExploreLayout } from "@/components/explore-layout"
import {
  getPublicHoursBatch,
  getPublicVenuesForIds,
  listMyFollows,
  type FollowRow,
  type PublicHours,
  type PublicVenue,
} from "@/lib/api/xvm-api"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"

export const metadata: Metadata = {
  title: "Discover Venues",
  description: "Find FFXIV roleplay venues open tonight across every data centre and world.",
  alternates: { canonical: "https://xivvenuemanager.com/discover" },
}

export const revalidate = 60

// "Tonight" window: events starting within the next 8 hours, or started up to 30 min ago
function tonightWindow(): { from: Date; to: Date } {
  const now = new Date()
  return {
    from: new Date(now.getTime() - 30 * 60 * 1000),
    to: new Date(now.getTime() + 8 * 60 * 60 * 1000),
  }
}

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions)
  const { from, to } = tonightWindow()

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    include: {
      events: {
        where: {
          OR: [{ status: "ACTIVE" }, { startTime: { gte: from, lte: to } }],
        },
        orderBy: { startTime: "asc" },
        select: { id: true, title: true, startTime: true, status: true },
        take: 2,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const follows: FollowRow[] = session?.user?.id
    ? await (await xvmPersonReader(session.user.id))("discover follows", [], (token) => listMyFollows(token))
    : []
  const followedXvmIds = new Set(follows.map((f) => f.venue_id))

  // xvm-api is the source of truth for a connected venue's hours - one batched
  // read for the whole page (take: 50 above stays within the batch cap) rather
  // than one request per venue. Unconnected venues and failed reads show
  // closed (unless a live event is running) - Prisma no longer computes hours.
  const xvmVenueIds = venues.map((v) => v.xvmApiVenueId).filter((id): id is string => id !== null)
  let hoursByVenue: Record<string, PublicHours> = {}
  let profileByVenue: Record<string, PublicVenue> = {}
  if (xvmVenueIds.length > 0) {
    try {
      hoursByVenue = (await getPublicHoursBatch(xvmVenueIds)).venues
    } catch {
      hoursByVenue = {}
    }
    profileByVenue = await getPublicVenuesForIds(xvmVenueIds)
  }

  const cards: DiscoverVenue[] = venues.map((v) => {
    const activeEvent = v.events.find((e) => e.status === "ACTIVE") ?? null
    const upcomingEvent = v.events.find((e) => e.status !== "ACTIVE") ?? null
    const xvmHoursEntry = v.xvmApiVenueId ? hoursByVenue[v.xvmApiVenueId] : undefined
    const xvmProfile = v.xvmApiVenueId ? profileByVenue[v.xvmApiVenueId] : undefined
    return {
      id: v.id,
      name: xvmProfile?.name ?? v.slug,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      district: xvmProfile?.district ?? null,
      ward: xvmProfile?.ward ?? null,
      plot: xvmProfile?.plot ?? null,
      apartment: xvmProfile?.room ?? null,
      description: xvmProfile?.description ?? null,
      followCount: xvmProfile?.follower_count ?? 0,
      isFollowed: v.xvmApiVenueId !== null && followedXvmIds.has(v.xvmApiVenueId),
      isOpenNow: activeEvent !== null || (xvmHoursEntry?.open_now.open ?? false),
      isTonightOpen: v.events.length > 0,
      activeEvent: activeEvent ? { title: activeEvent.title } : null,
      upcomingEvent: upcomingEvent
        ? { title: upcomingEvent.title, startTime: upcomingEvent.startTime.toISOString() }
        : null,
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
