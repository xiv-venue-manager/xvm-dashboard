import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { ReactionRolePanelsBoard } from "@/components/reaction-role-panels-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listPanels, listReactionRoleTemplates, type PanelRow, type TemplateRow } from "@/lib/api/xvm-api"

export default async function ReactionRolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role

  let panels: PanelRow[] = []
  let templates: TemplateRow[] = []
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      ;[panels, templates] = await Promise.all([
        listPanels(token, venue.xvmApiVenueId),
        listReactionRoleTemplates(token),
      ])
    } catch (err) {
      console.error("[reaction-roles page] listPanels/listReactionRoleTemplates error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Reaction Roles</h1>
        </div>

        <ReactionRolePanelsBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          panels={panels}
          templates={templates}
          notConnected={notConnected}
        />
      </div>
    </VenueLayout>
  )
}
