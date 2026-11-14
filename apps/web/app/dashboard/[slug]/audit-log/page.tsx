import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { AuditLogBoard } from "@/components/audit-log-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import {
  getAuditLogSettings,
  listAuditLogEvents,
  type AuditLogEventRow,
  type AuditLogSettingsRow,
} from "@/lib/api/xvm-api"

export default async function AuditLogPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let settings: AuditLogSettingsRow = { channel_id: null }
  let events: AuditLogEventRow[] = []
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      ;[settings, events] = await Promise.all([getAuditLogSettings(token, venue.id), listAuditLogEvents(token, venue.id)])
    } catch (err) {
      console.error("[audit-log page] read error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
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
          <h1 className="page-h1">Audit Log</h1>
        </div>

        <AuditLogBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          settings={settings}
          events={events}
        />
      </div>
    </VenueLayout>
  )
}
