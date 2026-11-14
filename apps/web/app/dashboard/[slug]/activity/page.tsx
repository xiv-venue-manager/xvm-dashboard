import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { ActivityLogFeed } from "@/components/activity-log-feed"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listActivity, listMemberships, type ActivityRow } from "@/lib/api/xvm-api"
import { ACTIVITY_PAGE_SIZE } from "@/lib/activity-log"

export default async function ActivityLogPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role
  const canView = ["OWNER", "MANAGER"].includes(userRole)

  let rows: ActivityRow[] = []
  let people: { id: number; name: string }[] = []
  let loadFailed = false
  const token = canView ? await getValidXvmApiToken(session.user.id) : null
  if (token) {
    const [activity, memberships] = await Promise.allSettled([
      listActivity(token, venue.id, { limit: ACTIVITY_PAGE_SIZE }),
      listMemberships(token, venue.id),
    ])
    if (activity.status === "fulfilled") {
      rows = activity.value
    } else {
      loadFailed = true
    }
    if (memberships.status === "fulfilled") {
      people = memberships.value
        .map((m) => ({ id: m.person.id, name: m.nickname ?? m.person.display_name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    for (const result of [activity, memberships]) {
      if (result.status === "rejected") {
        console.error("[activity page] read error:", result.reason)
        if (isXvmAuthFailure(result.reason)) {
          await invalidateXvmApiCredential(session.user.id)
          break
        }
      }
    }
  } else if (canView) {
    loadFailed = true
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner max-w-3xl">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Activity Log</h1>
        </div>

        {canView ? (
          <ActivityLogFeed venueId={venue.id} people={people} rows={rows} loadFailed={loadFailed} />
        ) : (
          <p className="text-sm text-muted-foreground">Only owners and managers can see the activity log.</p>
        )}
      </div>
    </VenueLayout>
  )
}
