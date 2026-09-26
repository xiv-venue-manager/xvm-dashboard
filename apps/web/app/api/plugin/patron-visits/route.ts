import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { pluginXvmContext } from "@/lib/api/plugin-xvm"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPatronLogs, logPatronVisit } from "@/lib/api/xvm-api"
import { venueEventBus } from "@/lib/sse/venue-events"
import { postPatronVisitXp } from "@/lib/discord-feed"
import { validators } from "@/lib/validation"

const LOG_WINDOW_MS = 59 * 24 * 60 * 60 * 1000
const LOG_PAGE_MAX = 200

const patronVisitSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  characterName: validators.characterName,
  world: validators.world,
  action: z.enum(["enter", "leave", "present"], { message: "action must be one of: 'enter', 'leave', 'present'" }),
  timestamp: validators.datetime,
})

export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    let data: z.infer<typeof patronVisitSchema>
    try {
      data = patronVisitSchema.parse(await request.json())
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }

    if (!auth.venues.includes(data.venueId)) {
      return NextResponse.json({ error: "Permission denied to log at this venue" }, { status: 403 })
    }

    const context = await pluginXvmContext(auth.userId, data.venueId)
    if ("error" in context) return context.error

    let logged
    try {
      logged = await logPatronVisit(context.token, context.xvmApiVenueId, {
        character_name: data.characterName,
        world: data.world,
        action: data.action,
        ts: new Date(data.timestamp).toISOString(),
      })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[Plugin API] patron visit error")
    }

    if (!logged.deduped && !logged.was_working) {
      venueEventBus.emit(data.venueId, {
        id: String(logged.id),
        type: data.action === "leave" ? "patron_exit" : "patron_enter",
        venueId: data.venueId,
        timestamp: new Date(data.timestamp).toISOString(),
        data: { characterName: data.characterName, world: data.world },
      })
    }

    if (!logged.deduped && data.action === "enter") {
      postPatronVisitXp(data.venueId, data.characterName, data.world)
    }

    return NextResponse.json({
      success: true,
      message: logged.deduped ? "Duplicate suppressed (state already matches)" : "Patron visit logged",
      data: {
        id: String(logged.id),
        characterName: data.characterName,
        world: data.world,
        action: data.action,
        deduped: logged.deduped,
        wasWorking: logged.was_working,
        eventId: logged.event_id === null ? null : String(logged.event_id),
      },
    })
  } catch (error) {
    console.error("[Plugin API] Error logging patron visit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), LOG_PAGE_MAX)

    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 })
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Access denied to this venue" }, { status: 403 })
    }

    const context = await pluginXvmContext(auth.userId, venueId)
    if ("error" in context) return context.error

    const now = new Date()
    let rows
    try {
      rows = await listPatronLogs(context.token, context.xvmApiVenueId, {
        from: new Date(now.getTime() - LOG_WINDOW_MS).toISOString(),
        to: now.toISOString(),
        limit,
      })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[Plugin API] patron visits read error")
    }

    return NextResponse.json({
      visits: rows.map((row) => ({
        id: String(row.id),
        characterName: row.character_name,
        world: row.world,
        action: row.action.toUpperCase(),
        countChange: row.count_change,
        timestamp: row.ts,
        loggedAt: row.logged_at,
      })),
    })
  } catch (error) {
    console.error("[Plugin API] Error fetching patron visits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
