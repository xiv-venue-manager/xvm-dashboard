import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireVenueRole } from "@/lib/api/venue-access"
import { redeemCode, getVenues } from "@/lib/frogge-api"

export async function POST(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

    const access = await requireVenueRole(session.user.id, venueId, "MANAGER", "Only owners and managers can connect Frogge")
    if (!access.ok) return access.response

    const body = await request.json()
    const code = body?.code?.trim()

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 })
    }

    const result = await redeemCode(code)

    let froggeVenueId: string | undefined = result.froggeVenueId
    if (!froggeVenueId) {
      try {
        const venues = await getVenues(result.token)
        froggeVenueId = venues[0]?.id
      } catch {
        froggeVenueId = undefined
      }
    }

    await prisma.venue.update({
      where: { id: venueId },
      data: {
        froggeToken: result.token,
        froggeVenueId,
        froggeConnectedAt: new Date(),
        froggeConnectedBy: session.user.id,
      },
    })

    return NextResponse.json({ connected: true })
  } catch (error) {
    console.error("[Frogge redeem] Error:", error)
    const message = error instanceof Error ? error.message : "Failed to redeem code"
    if (message.includes("404") || message.includes("400") || message.includes("expired")) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
