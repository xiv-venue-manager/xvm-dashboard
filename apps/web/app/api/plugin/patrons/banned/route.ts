import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listBannedPatrons } from "@/lib/api/xvm-api"

/**
 * GET /api/plugin/patrons/banned?venueId=…
 *
 * Returns characterName/world/reason for patrons banned at this venue,
 * for the plugin to warn staff in its in-game guest list. Fetched once
 * per venue-select (see AutoLoadXivAppDataAsync /
 * LoadVenueDataWithFeedbackAsync) — not a live feed. Informational
 * only: the plugin has no way to actually block a banned patron from
 * entering.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    const token = await getValidXvmApiToken(auth.userId)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const bannedPatrons = await listBannedPatrons(token, venue.xvmApiVenueId)
      return NextResponse.json({
        bannedPatrons: bannedPatrons.map((p) => ({
          characterName: p.character_name,
          world: p.world,
          reason: p.ban_reason ?? "",
        })),
      })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[plugin/patrons/banned] error")
    }
  } catch (error) {
    console.error("[Plugin API] Error fetching banned patrons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
