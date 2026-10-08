import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireVenueRole } from "@/lib/api/venue-access"
import { syncVenuePartakeEvents } from "@/lib/partake"

export async function POST(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

    const access = await requireVenueRole(session.user.id, venueId, "MANAGER", "Only owners and managers can trigger sync")
    if (!access.ok) return access.response

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerId: true, partakeTeamId: true, name: true },
    })

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    if (!venue.partakeTeamId) {
      return NextResponse.json({ error: "No Partake Team ID configured. Save settings first." }, { status: 400 })
    }

    const results = await syncVenuePartakeEvents({
      id: venue.id,
      ownerId: venue.ownerId,
      partakeTeamId: venue.partakeTeamId,
    })

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("[Partake Sync] Manual sync error:", error)
    return NextResponse.json({ error: "Sync failed. Check that your Partake Team ID is correct." }, { status: 500 })
  }
}
