import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getQuoteBoardSettings, updateQuoteBoardSettings, type QuoteBoardSettingsUpdate } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { validators } from "@/lib/validation"

const settingsSchema = z
  .object({
    boardChannelId: validators.snowflake.nullable().optional(),
    emoji: z.string().trim().min(1).max(100).optional(),
    reactionThreshold: z.number().int().min(1).max(100).optional(),
    allowNsfwSources: z.boolean().optional(),
    blacklistedChannelIds: z.array(validators.snowflake).max(100).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

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
    const lookup = await requireMyVenue(session.user.id, venueId, "[quote-board] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof settingsSchema>
    try {
      data = settingsSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const requested = [
      ...new Set([...(data.boardChannelId ? [data.boardChannelId] : []), ...(data.blacklistedChannelIds ?? [])]),
    ]
    if (requested.length > 0) {
      let stored: Awaited<ReturnType<typeof getQuoteBoardSettings>>
      try {
        stored = await getQuoteBoardSettings(token, lookup.venue.id)
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[quote-board/settings] PUT error")
      }
      const known = new Set([
        ...(stored.board_channel_id ? [stored.board_channel_id] : []),
        ...stored.blacklisted_channel_ids,
      ])
      for (const channelId of requested.filter((id) => !known.has(id))) {
        const channel = await requireChannelInGuild(session.user.id, venueId, channelId)
        if (!channel.ok) return channel.response
      }
    }

    const update: QuoteBoardSettingsUpdate = {
      ...(data.boardChannelId !== undefined && { board_channel_id: data.boardChannelId }),
      ...(data.emoji !== undefined && { emoji: data.emoji }),
      ...(data.reactionThreshold !== undefined && { reaction_threshold: data.reactionThreshold }),
      ...(data.allowNsfwSources !== undefined && { allow_nsfw_sources: data.allowNsfwSources }),
      ...(data.blacklistedChannelIds !== undefined && { blacklisted_channel_ids: data.blacklistedChannelIds }),
    }

    try {
      return NextResponse.json(await updateQuoteBoardSettings(token, lookup.venue.id, update))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[quote-board/settings] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)
