import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireVenueRole } from "@/lib/api/venue-access"
import { getGuildMembers } from "@/lib/frogge-api"

export async function GET(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

    const access = await requireVenueRole(session.user.id, venueId, "STAFF", "Not a member of this venue")
    if (!access.ok) return access.response

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeToken: true },
    })

    if (!venue?.froggeToken) {
      return NextResponse.json({ error: "Venue not connected to Frogge" }, { status: 400 })
    }

    const members = await getGuildMembers(venue.froggeToken)
    return NextResponse.json(members)
  } catch (error) {
    console.error("[Frogge members] Error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch members"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
