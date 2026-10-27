import { NextRequest, NextResponse } from "next/server"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { wantsRefresh } from "@/lib/api/venue-guild"
import { requirePlatformAdmin } from "@/lib/admin-access"
import { getApplicationEmojis, type DiscordEmojiOption } from "@/lib/discord-rest"

/**
 * GET /api/admin/discord/emojis
 * The bot's own emoji, for surfaces with no venue to scope to - the platform reaction role
 * template editor, whose templates are copied into every venue and so cannot carry a guild's.
 *
 * The admin scope is read from the caller's xvm-api credential, so this needs their link even
 * though it never calls xvm-api for data.
 */
export const GET = withRateLimit(
  async (request: NextRequest) => {
    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const key = cacheKeys.discordAppEmojis()
    let emojis = wantsRefresh(request) ? null : await getCached<DiscordEmojiOption[]>(key)
    if (!emojis) {
      const result = await getApplicationEmojis()
      // Not discordFailureResponse: its 404 case says the bot is absent from the venue's server,
      // and there is no venue here.
      if (!result.ok) {
        return NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 })
      }
      emojis = result.data
      await setCache(key, emojis, cacheTTL.discordGuild)
    }

    return NextResponse.json({ emojis })
  },
  { requests: 30, window: "1 m" }
)
