import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { LevelingBoard } from "@/components/leveling-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import {
  getLevelingLeaderboard,
  getLevelingSettings,
  listLevelingRules,
  listLevelingTiers,
  type LevelingRuleRow,
  type LevelingSettings,
  type LevelingStanding,
  type LevelingTierRow,
} from "@/lib/api/xvm-api"

export default async function LevelingPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role
  const canManage = ["OWNER", "MANAGER"].includes(userRole)

  let settings: LevelingSettings | null = null
  let standings: LevelingStanding[] = []
  let rules: LevelingRuleRow[] = []
  let tiers: LevelingTierRow[] = []
  let loadFailed = false
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      ;[settings, standings, rules, tiers] = await Promise.all([
        getLevelingSettings(token, venue.id),
        getLevelingLeaderboard(token, venue.id),
        canManage ? listLevelingRules(token, venue.id) : Promise.resolve([]),
        canManage ? listLevelingTiers(token, venue.id) : Promise.resolve([]),
      ])
    } catch (err) {
      loadFailed = true
      console.error("[leveling page] read error:", err)
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
          <h1 className="page-h1">Leveling</h1>
        </div>

        {loadFailed || !settings ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load leveling. Try reloading the page.</p>
        ) : (
          <LevelingBoard venueId={venue.id} canManage={canManage} settings={settings} standings={standings} rules={rules} tiers={tiers} />
        )}
      </div>
    </VenueLayout>
  )
}
