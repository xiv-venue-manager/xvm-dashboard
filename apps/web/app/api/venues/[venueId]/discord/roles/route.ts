import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { requireVenueGuild, discordFailureResponse, wantsRefresh } from "@/lib/api/venue-guild"
import { getGuildRoles, unsafeRoleReason, type DiscordRoleOption } from "@/lib/discord-rest"

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

    const key = cacheKeys.discordRoles(guild.guildId)
    let roles = wantsRefresh(request) ? null : await getCached<DiscordRoleOption[]>(key)
    if (!roles) {
      const result = await getGuildRoles(guild.guildId)
      if (!result.ok) return discordFailureResponse(result.status)
      roles = result.data
      // Only a success is cached. A five-minute memory of a transient Discord failure would be
      // worse than the failure, and getOrSet cannot express that.
      await setCache(key, roles, cacheTTL.discordGuild)
    }

    // Annotated, not filtered. filterAssignableRoles sits beside the bot token in discord-rest,
    // so a client component cannot import it; and the picker is the only thing that knows which
    // role the row already holds, which has to stay selectable however unsafe it looks. The raw
    // permissions bitfield is deliberately not returned - unsafeReason is the only part of it a
    // caller can act on, and a submit handler re-checks server-side regardless.
    return NextResponse.json({
      guildId: guild.guildId,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        unsafeReason: unsafeRoleReason(role, guild.guildId),
      })),
    })
  },
  { requests: 30, window: "1 m" }
)
