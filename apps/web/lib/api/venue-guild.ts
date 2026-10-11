import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireVenueRole } from "@/lib/api/venue-access"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue } from "@/lib/api/xvm-api"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { getGuildChannels, getChannelInfo, isThreadChannelType, type DiscordChannelOption } from "@/lib/discord-rest"

export type VenueGuild = { ok: true; guildId: string } | { ok: false; response: NextResponse }

/**
 * The venue's Discord server, for a caller allowed to see it.
 *
 * Every picker needs the same four things established before it can ask Discord anything: that
 * the caller works at this venue, that the venue exists in xvm-api, that we hold a token for
 * them, and that a Discord server is linked. Each answers with its own status so the UI can tell
 * "you can't see this" from "nothing is connected yet" from "try again".
 *
 * STAFF, not MANAGER: the pickers are read-only option lists, and a staff member filling in a
 * form needs the same channel and role names a manager does. What they may then save is enforced
 * by the route that takes the submission.
 */
export async function requireVenueGuild(userId: string, venueId: string): Promise<VenueGuild> {
  const access = await requireVenueRole(userId, venueId, "STAFF", "You don't have access to this venue")
  if (!access.ok) return { ok: false, response: access.response }

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }

  const token = await getValidXvmApiToken(userId)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }),
    }
  }

  try {
    const detail = await getVenue(token, venue.xvmApiVenueId)
    const link = detail.external_links.find((l) => l.provider === "DiscordGuild" && l.unlinked_at === null)
    if (!link) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "not_linked", message: "Connect this venue's Discord server first." },
          { status: 409 }
        ),
      }
    }
    return { ok: true, guildId: link.external_id }
  } catch (err) {
    return { ok: false, response: await xvmApiErrorResponse(err, userId, "[venue guild] venue read error") }
  }
}

/**
 * Discord said no. 404 means the bot cannot see the guild at all, which is actionable by a
 * person (invite it); anything else is ours or Discord's to fix, so it reads as transient.
 * Deliberately the same two shapes the connect flow already answers with, so the pickers do not
 * need a third way to describe a Discord failure.
 */
export function discordFailureResponse(status?: number): NextResponse {
  if (status === 404) {
    return NextResponse.json(
      { error: "bot_absent", message: "The bot isn't in this venue's Discord server." },
      { status: 409 }
    )
  }
  return NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 })
}

/** `?refresh=1` skips the cache for one request. */
export function wantsRefresh(request: Request): boolean {
  return new URL(request.url).searchParams.get("refresh") === "1"
}

export type ChannelCheck = { ok: true } | { ok: false; response: NextResponse }

/**
 * Whether a channel id belongs to this venue's Discord server.
 *
 * The pickers only offer the right channels; the routes that take a channel are reachable by
 * direct request and by the paste-an-id fallback, and the bot posts to whatever id it is given. An
 * unchecked id lets a venue point the bot at a channel in any server the bot has joined.
 *
 * Fails closed: no linked server, bot absent, or Discord unreachable all refuse, because none of
 * them lets the id be checked. Each says why, so the form can tell a person what to fix.
 *
 * The channel list is cached for five minutes, so a miss is re-checked against Discord before
 * refusing. Only a live answer may say a channel is not in the server, otherwise a channel made a
 * minute ago would be refused as foreign.
 *
 * The list never includes threads, so an id missing from it is then looked up as a channel in its own
 * right. A thread in this server is accepted, since a message can be posted to one. Anything else in
 * this server (forum, voice, stage) is refused as the wrong kind of channel, not as a foreign one.
 */
export async function requireChannelInGuild(userId: string, venueId: string, channelId: string): Promise<ChannelCheck> {
  const guild = await requireVenueGuild(userId, venueId)
  if (!guild.ok) return guild

  const key = cacheKeys.discordChannels(guild.guildId)
  const cached = await getCached<DiscordChannelOption[]>(key)
  if (cached?.some((channel) => channel.id === channelId)) return { ok: true }

  const live = await getGuildChannels(guild.guildId)
  if (!live.ok) return { ok: false, response: discordFailureResponse(live.status) }
  await setCache(key, live.data, cacheTTL.discordGuild)

  if (live.data.some((channel) => channel.id === channelId)) return { ok: true }

  const channel = await getChannelInfo(channelId)
  if (!channel.ok && channel.status !== 404 && channel.status !== 403) {
    return { ok: false, response: discordFailureResponse(channel.status) }
  }
  if (!channel.ok || channel.data.guildId !== guild.guildId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "channel_not_in_guild", message: "That channel isn't in this venue's Discord server." },
        { status: 400 }
      ),
    }
  }
  if (isThreadChannelType(channel.data.type)) return { ok: true }
  return {
    ok: false,
    response: NextResponse.json(
      { error: "channel_not_text", message: "That channel isn't a text channel in this venue's Discord server." },
      { status: 400 }
    ),
  }
}
