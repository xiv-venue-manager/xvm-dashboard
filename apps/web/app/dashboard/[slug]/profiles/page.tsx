import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { ProfilesBoard } from "@/components/profiles-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { getProfileSettings, listProfiles, type ProfileRow } from "@/lib/api/xvm-api"

export default async function ProfilesPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role
  const canManage = ["OWNER", "MANAGER"].includes(userRole)

  let mine: ProfileRow[] = []
  let all: ProfileRow[] = []
  let approvalRequired = true
  let loadFailed = false
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      const [own, everyone, settings] = await Promise.all([
        listProfiles(token, venue.id, { mine: true }),
        canManage ? listProfiles(token, venue.id) : Promise.resolve([]),
        getProfileSettings(token, venue.id),
      ])
      mine = own
      all = everyone
      approvalRequired = settings.approval_required
    } catch (err) {
      loadFailed = true
      console.error("[profiles page] read error:", err)
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
          <h1 className="page-h1">Character Profiles</h1>
        </div>

        {loadFailed ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the profiles. Try reloading the page.</p>
        ) : (
          <ProfilesBoard venueId={venue.id} canManage={canManage} mine={mine} all={all} approvalRequired={approvalRequired} />
        )}
      </div>
    </VenueLayout>
  )
}
