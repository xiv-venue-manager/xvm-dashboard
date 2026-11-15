import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getLevelingSettings, updateLevelingSettings, type LevelingSettingsUpdate } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { settingsBodySchema } from "@/lib/leveling"

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[leveling] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof settingsBodySchema>
    try {
      data = settingsBodySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const requested = [
      ...new Set([...(data.announcementChannelId ? [data.announcementChannelId] : []), ...(data.excludedChannelIds ?? [])]),
    ]
    if (requested.length > 0) {
      let stored: Awaited<ReturnType<typeof getLevelingSettings>>
      try {
        stored = await getLevelingSettings(token, lookup.venue.id)
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[leveling/settings] PUT error")
      }
      const known = new Set([
        ...(stored.announcement_channel_id ? [stored.announcement_channel_id] : []),
        ...stored.excluded_channel_ids,
      ])
      for (const channelId of requested.filter((id) => !known.has(id))) {
        const channel = await requireChannelInGuild(session.user.id, venueId, channelId)
        if (!channel.ok) return channel.response
      }
    }

    const update: LevelingSettingsUpdate = {
      ...(data.xpName !== undefined && { xp_name: data.xpName }),
      ...(data.curveQuadratic !== undefined && { curve_quadratic: data.curveQuadratic }),
      ...(data.curveLinear !== undefined && { curve_linear: data.curveLinear }),
      ...(data.announcementChannelId !== undefined && { announcement_channel_id: data.announcementChannelId }),
      ...(data.excludedChannelIds !== undefined && { excluded_channel_ids: data.excludedChannelIds }),
      ...(data.excludedRoleIds !== undefined && { excluded_role_ids: data.excludedRoleIds }),
      ...(data.voiceNeedsCompany !== undefined && { voice_needs_company: data.voiceNeedsCompany }),
    }

    try {
      return NextResponse.json(await updateLevelingSettings(token, lookup.venue.id, update))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[leveling/settings] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)
