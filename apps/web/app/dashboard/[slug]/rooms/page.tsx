import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { roleInVenue } from "@/lib/api/venue-access"
import { VenueLayout } from "@/components/venue-layout"
import { RoomsBoard, type RoomItem } from "@/components/rooms-board"
import { RoomManagerRoles } from "@/components/room-manager-roles"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listRooms } from "@/lib/api/xvm-api"

export default async function RoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({ where: { slug } })

  const userRole = venue ? await roleInVenue(session.user.id, venue) : null
  if (!venue || !userRole) notFound()


  let rooms: RoomItem[] = []
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      rooms = await listRooms(token, venue.xvmApiVenueId)
    } catch (err) {
      console.error("[rooms page] listRooms error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  const settings = (venue.settings as { roomManagerRoleIds?: string[] }) ?? {}
  const roomManagerRoleIds = settings.roomManagerRoleIds ?? []

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
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          rooms={rooms}
          notConnected={notConnected}
        />

        <RoomManagerRoles
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          initialRoleIds={roomManagerRoleIds}
        />
      </div>
    </VenueLayout>
  )
}
