import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { requireVenueGuild, discordFailureResponse } from "@/lib/api/venue-guild"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import { searchGuildMembers, getGuildMembers, type DiscordMemberOption } from "@/lib/discord-rest"

// One form can hold a handful of saved ids; a cap keeps a hand-written request from turning into
// an unbounded fan-out of Discord calls.
const MAX_RESOLVE = 50

/**
 * Two access patterns, one resource, deliberately different caching.
 *
 * `?q=` searches, and is never cached: it runs per keystroke and the key space is every string
 * anyone might type. `?ids=` resolves saved ids to names, and is cached for an hour per member,
 * because those are rendered on every form that holds one.
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = new URL(request.url).searchParams
    const ids = params.get("ids")
    const query = params.get("q")
    if (!ids && !query) {
      return NextResponse.json({ error: "Pass q to search or ids to resolve" }, { status: 400 })
    }

    const { venueId } = await context.params
    const guild = await requireVenueGuild(session.user.id, venueId)
    if (!guild.ok) return guild.response

    if (ids) {
      const wanted = [...new Set(ids.split(",").map((id) => id.trim()))]
        .filter((id) => id.length <= 20 && SNOWFLAKE_PATTERN.test(id))
        .slice(0, MAX_RESOLVE)
      const members: Record<string, DiscordMemberOption> = {}
      const misses: string[] = []
      for (const id of wanted) {
        const hit = await getCached<DiscordMemberOption>(cacheKeys.discordMember(guild.guildId, id))
        if (hit) members[id] = hit
        else misses.push(id)
      }
      if (misses.length > 0) {
        // getGuildMembers omits an id it could not fetch rather than failing the batch, so a
        // member who has left is simply absent and the caller falls back to the raw id.
        const found = await getGuildMembers(guild.guildId, misses)
        for (const [id, member] of found) {
          members[id] = member
          await setCache(cacheKeys.discordMember(guild.guildId, id), member, cacheTTL.discordMember)
        }
      }
      return NextResponse.json({ guildId: guild.guildId, members })
    }

    const result = await searchGuildMembers(guild.guildId, query!)
    if (!result.ok) return discordFailureResponse(result.status)
    return NextResponse.json({ guildId: guild.guildId, members: result.data })
  },
  { requests: 60, window: "1 m" }
)
