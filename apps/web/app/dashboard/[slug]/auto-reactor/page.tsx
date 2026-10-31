import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { AutoReactorBoard } from "@/components/auto-reactor-board"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { listAutoReactorRules, listModules, type AutoReactorRuleRow, type ModuleRow } from "@/lib/api/xvm-api"

export default async function AutoReactorPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let rules: AutoReactorRuleRow[] = []
  let modules: ModuleRow[] = []
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      ;[rules, modules] = await Promise.all([listAutoReactorRules(token, venue.id), listModules(token, venue.id)])
    } catch (err) {
      console.error("[auto-reactor page] read error:", err)
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
          <h1 className="page-h1">Auto-Reactor</h1>
        </div>

        <AutoReactorBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          rules={rules}
          enabled={modules.find((m) => m.module === "auto_reactor")?.enabled ?? false}
        />
      </div>
    </VenueLayout>
  )
}
