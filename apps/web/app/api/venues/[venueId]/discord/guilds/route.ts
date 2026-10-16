import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, isVenueOwner, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getVenue, listMemberships } from "@/lib/api/xvm-api"
import { discordGrantFrom, listManageableGuilds } from "@/lib/discord-user"
import { getGuildPresence } from "@/lib/discord-rest"

// xvm-api has no person-by-id route, so the venue's own membership list is the only place a
// linker's name can come from. A byline is cosmetic, so every way of not finding one - no actor
// recorded, a linker who was never a member, a failed read - answers null and omits it rather
// than failing the page.
async function linkerName(token: string, venueId: string, personId: number | null) {
  if (personId === null) return null
  try {
    const memberships = await listMemberships(token, venueId)
    return memberships.find((row) => row.person.id === personId)?.person.display_name ?? null
  } catch {
    return null
  }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const lookup = await requireMyVenue(session.user.id, venueId, "[discord guilds] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let live: {
      id: number
      external_id: string
      linked_at: string
      linked_by_person_id: number | null
    } | null
    try {
      if (!(await isVenueOwner(session.user.id, token, lookup.venue.id))) {
        return NextResponse.json({ error: "Only the venue owner can connect a Discord server" }, { status: 403 })
      }
      const detail = await getVenue(token, lookup.venue.id)
      live =
        detail.external_links.find((link) => link.provider === "DiscordGuild" && link.unlinked_at === null) ?? null
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord guilds] venue read error")
    }

    // The linked guild's name and icon come from the bot, not from the caller's own guild list: a
    // link worth unlinking is often one pointing at a server the caller no longer manages, and that
    // is exactly when the caller's list would render a bare snowflake. The bot is a member by
    // definition, since linking refused without it.
    let current: {
      linkId: number
      guildId: string
      linkedAt: string
      linkedBy: string | null
      name: string | null
      iconUrl: string | null
    } | null = null
    if (live) {
      const presence = await getGuildPresence(live.external_id)
      current = {
        linkId: live.id,
        guildId: live.external_id,
        linkedAt: live.linked_at,
        linkedBy: await linkerName(token, lookup.venue.id, live.linked_by_person_id),
        name: presence.name,
        iconUrl: presence.iconUrl,
      }
    }

    const manageable = await listManageableGuilds(await discordGrantFrom(request))

    // reauth_required is a state of the caller's account, not a failure, so it answers 200 with the
    // current link still rendered and a prompt. discord_unavailable is Discord being broken, which
    // the UI has to say differently - and which must not read as "you administer no servers".
    if (!manageable.ok && manageable.failure === "discord_unavailable") {
      return NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 })
    }

    return NextResponse.json({
      current,
      needsReauth: !manageable.ok,
      guilds: manageable.ok ? manageable.guilds : [],
    })
  },
  { requests: 20, window: "1 m" }
)
