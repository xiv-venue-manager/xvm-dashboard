import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { pluginXvmContext } from "@/lib/api/plugin-xvm"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getPatronPresence } from "@/lib/api/xvm-api"

export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 })
    }
    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Access denied to this venue" }, { status: 403 })
    }

    const context = await pluginXvmContext(auth.userId, venueId)
    if ("error" in context) return context.error

    let presence
    try {
      presence = await getPatronPresence(context.token, context.xvmApiVenueId)
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[Plugin API] present patrons error")
    }

    return NextResponse.json({
      venueId,
      count: presence.count,
      present: presence.present.map((p) => ({
        characterName: p.character_name,
        world: p.world,
        wasWorking: p.was_working,
        since: p.since,
      })),
    })
  } catch (error) {
    console.error("[Plugin API] Error fetching present patrons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
