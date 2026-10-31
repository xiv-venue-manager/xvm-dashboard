import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue, requireMyVenueRole } from "@/lib/api/venue-access"
import { getDiscordSettings, updateDiscordSettings, type DiscordSettings } from "@/lib/api/xvm-api"
import { validators } from "@/lib/validation"

const channelId = validators.snowflake.nullable().optional()

const updateSchema = z.object({
  honeypotChannelId: channelId,
  eventsChannelId: channelId,
  roomsChannelId: channelId,
})

function served(settings: DiscordSettings) {
  return {
    honeypotChannelId: settings.honeypot_channel_id,
    eventsChannelId: settings.events_channel_id,
    roomsChannelId: settings.rooms_channel_id,
  }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (_request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[discord settings] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      return NextResponse.json(served(await getDiscordSettings(token, lookup.venue.id)))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord settings] read error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenueRole(
      session.user.id,
      venueId,
      "MANAGER",
      "Only a venue manager can change these",
      "[discord settings] /me/venues read error"
    )
    if (!lookup.ok) return lookup.response

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }
    const { honeypotChannelId, eventsChannelId, roomsChannelId } = parsed.data
    const changes: Partial<DiscordSettings> = {
      ...(honeypotChannelId !== undefined && { honeypot_channel_id: honeypotChannelId }),
      ...(eventsChannelId !== undefined && { events_channel_id: eventsChannelId }),
      ...(roomsChannelId !== undefined && { rooms_channel_id: roomsChannelId }),
    }
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      return NextResponse.json(served(await updateDiscordSettings(token, lookup.venue.id, changes)))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord settings] write error")
    }
  },
  { requests: 30, window: "1 m" }
)
