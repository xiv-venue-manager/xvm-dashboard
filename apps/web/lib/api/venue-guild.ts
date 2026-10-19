import { NextResponse } from "next/server"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue } from "@/lib/api/xvm-api"
import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import {
  getGuildChannels,
  getGuildRoles,
  getChannelInfo,
  isThreadChannelType,
  unsafeRoleReason,
  type DiscordChannelOption,
  type DiscordRoleOption,
} from "@/lib/discord-rest"

export type VenueGuild = { ok: true; guildId: string } | { ok: false; response: NextResponse }

/**
 * The venue's Discord server, for a caller allowed to see it.
 *
 * Every picker needs the same three things established before it can ask Discord anything: that
 * the caller works at this venue, that we hold a token for them, and that a Discord server is
 * linked. Each answers with its own status so the UI can tell "you can't see this" from "nothing
 * is connected yet" from "try again".
 *
 * Any member, not only managers: the pickers are read-only option lists, and a staff member
 * filling in a form needs the same channel and role names a manager does. What they may then
 * save is enforced by the route that takes the submission.
 */
export async function requireVenueGuild(userId: string, venueId: string): Promise<VenueGuild> {
  const lookup = await requireMyVenue(userId, venueId, "[venue guild] /me/venues read error")
  if (!lookup.ok) return { ok: false, response: lookup.response }

  const token = await getValidXvmApiToken(userId)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }),
    }
  }

  try {
    const detail = await getVenue(token, lookup.venue.id)
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

export type RoleCheck = { ok: true } | { ok: false; response: NextResponse }

/**
 * Whether a role id is one this venue's Discord server can hand out automatically.
 *
 * A position's role is granted to everyone holding the position, so an id that is another
 * server's, or that carries Administrator, is refused here whatever the picker showed. `current`
 * is the role the row already holds: it passes the safety check so re-saving an unrelated field
 * on a row that holds an unsafe role is not refused, but it still has to be in the server.
 *
 * Fails closed like requireChannelInGuild, and re-asks Discord before saying a role is missing, as
 * the cached list is five minutes old.
 */
export async function requireRoleInGuild(
  userId: string,
  venueId: string,
  roleId: string,
  current: string | null = null
): Promise<RoleCheck> {
  const guild = await requireVenueGuild(userId, venueId)
  if (!guild.ok) return guild

  const key = cacheKeys.discordRoles(guild.guildId)
  let role = (await getCached<DiscordRoleOption[]>(key))?.find((r) => r.id === roleId)
  if (!role) {
    const live = await getGuildRoles(guild.guildId)
    if (!live.ok) return { ok: false, response: discordFailureResponse(live.status) }
    await setCache(key, live.data, cacheTTL.discordGuild)
    role = live.data.find((r) => r.id === roleId)
  }

  if (!role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "role_not_in_guild", message: "That role isn't in this venue's Discord server." },
        { status: 400 }
      ),
    }
  }
  const unsafe = roleId === current ? null : unsafeRoleReason(role, guild.guildId)
  if (unsafe) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "role_unsafe", message: `That role can't be given out automatically: ${unsafe}.` },
        { status: 400 }
      ),
    }
  }
  return { ok: true }
}
