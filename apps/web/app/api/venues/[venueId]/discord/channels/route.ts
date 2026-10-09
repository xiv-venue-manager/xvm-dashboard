import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { requireVenueGuild, discordFailureResponse, wantsRefresh } from "@/lib/api/venue-guild"
import { getGuildChannels, type DiscordChannelOption } from "@/lib/discord-rest"

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const guild = await requireVenueGuild(session.user.id, venueId)
    if (!guild.ok) return guild.response

    const key = cacheKeys.discordChannels(guild.guildId)
    let channels = wantsRefresh(request) ? null : await getCached<DiscordChannelOption[]>(key)
    if (!channels) {
      const result = await getGuildChannels(guild.guildId)
      if (!result.ok) return discordFailureResponse(result.status)
      channels = result.data
      await setCache(key, channels, cacheTTL.discordGuild)
    }

    return NextResponse.json({ guildId: guild.guildId, channels })
  },
  { requests: 30, window: "1 m" }
)
