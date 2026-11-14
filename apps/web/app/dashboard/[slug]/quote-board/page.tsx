import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { QuoteBoardSettings } from "@/components/quote-board-settings"
import { QuoteBoardQuotes } from "@/components/quote-board-quotes"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import {
  getQuoteBoardSettings,
  getVenue,
  listQuotes,
  type QuoteBoardSettingsRow,
  type QuoteRow,
} from "@/lib/api/xvm-api"
import { QUOTE_PAGE_SIZE } from "@/lib/quote-board"

const DEFAULT_SETTINGS: QuoteBoardSettingsRow = {
  board_channel_id: null,
  emoji: "\u{1F4AC}",
  reaction_threshold: 1,
  allow_nsfw_sources: false,
  blacklisted_channel_ids: [],
}

export default async function QuoteBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let settings = DEFAULT_SETTINGS
  let quotes: QuoteRow[] = []
  let guildId: string | null = null
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      const [loadedSettings, loadedQuotes, detail] = await Promise.all([
        getQuoteBoardSettings(token, venue.id),
        listQuotes(token, venue.id, { limit: QUOTE_PAGE_SIZE }),
        getVenue(token, venue.id),
      ])
      settings = loadedSettings
      quotes = loadedQuotes
      guildId =
        detail.external_links.find((link) => link.provider === "DiscordGuild" && link.unlinked_at === null)?.external_id ??
        null
    } catch (err) {
      console.error("[quote-board page] read error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  const canManage = ["OWNER", "MANAGER"].includes(userRole)

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
          <h1 className="page-h1">Quote Board</h1>
        </div>

        <div className="space-y-8">
          <QuoteBoardSettings venueId={venue.id} canManage={canManage} settings={settings} />
          <QuoteBoardQuotes venueId={venue.id} canManage={canManage} guildId={guildId} quotes={quotes} />
        </div>
      </div>
    </VenueLayout>
  )
}
