import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { BanListManager } from "@/components/ban-list-manager"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listPatrons, listMemberships, type PatronSummary, type MembershipRow } from "@/lib/api/xvm-api"

export default async function BanListPage({ params }: { params: Promise<{ slug: string }> }) {
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
  if (!["OWNER", "MANAGER"].includes(userRole)) notFound()

  let banned: PatronSummary[] = []
  let memberships: MembershipRow[] = []
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      const [patrons, members] = await Promise.all([
        listPatrons(token, venue.xvmApiVenueId),
        listMemberships(token, venue.xvmApiVenueId),
      ])
      banned = patrons.filter((p) => p.is_banned)
      memberships = members
    } catch (err) {
      console.error("[ban-list page] listPatrons/listMemberships error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  const personsById = new Map(memberships.map((m) => [m.person.id, m.person]))

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
          <h1 className="page-h1">Ban List</h1>
        </div>

        <BanListManager
          venueId={venue.id}
          notConnected={notConnected}
          patrons={banned.map((p) => ({
            id: String(p.id),
            characterName: p.character_name,
            world: p.world,
            banReason: p.ban_reason,
            bannedAt: p.banned_at,
            bannedBy: p.banned_by_person_id
              ? {
                  id: String(p.banned_by_person_id),
                  name: personsById.get(p.banned_by_person_id)?.display_name ?? null,
                }
              : null,
          }))}
        />
      </div>
    </VenueLayout>
  )
}
