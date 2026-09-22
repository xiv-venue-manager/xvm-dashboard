import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { banPatronByName } from "@/lib/api/xvm-api"

const banSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  characterName: validators.characterName,
  world: validators.world,
  reason: z.string().trim().min(1, "Reason is required").max(500, "Reason too long (max 500 characters)"),
})

/**
 * POST /api/plugin/patrons/ban
 *
 * Ban a patron from the Dalamud plugin (/xvm ban! <reason>). xvm-api's
 * ban-by-name endpoint finds-or-creates the patron itself; Manager tier
 * is enforced server-side there, same as the dashboard's ban route.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId, characterName, world, reason } = banSchema.parse(body)

    if (!auth.venues.includes(venueId)) {
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
      await banPatronByName(token, venue.xvmApiVenueId, characterName, world, reason.trim())
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[plugin/patrons/ban] error")
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error banning patron:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
