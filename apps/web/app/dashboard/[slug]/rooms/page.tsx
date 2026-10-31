import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { RoomsBoard, type RoomItem, type RoomPeopleNames } from "@/components/rooms-board"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { listMemberships, listRooms } from "@/lib/api/xvm-api"

export default async function RoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  const userRole = venue.role

  let rooms: RoomItem[] = []
  const names: RoomPeopleNames = { byPersonId: {}, byMembershipId: {} }
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      rooms = await listRooms(token, venue.id)
    } catch (err) {
      console.error("[rooms page] listRooms error:", err)
    }
  }

  if (token && rooms.length > 0) {
    try {
      for (const m of await listMemberships(token, venue.id)) {
        const name = m.nickname ?? m.person.display_name
        names.byPersonId[m.person.id] = name
        names.byMembershipId[m.id] = name
      }
    } catch (err) {
      console.error("[rooms page] listMemberships error:", err)
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
          <h1 className="page-h1">Rooms</h1>
        </div>

        <RoomsBoard
          venueSlug={venue.slug}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          rooms={rooms}
          names={names}
        />
      </div>
    </VenueLayout>
  )
}
