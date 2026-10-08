import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { getValidXvmApiToken, isVenueOwner, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue, linkVenueExternal, unlinkVenueExternal } from "@/lib/api/xvm-api"
import { administersGuild } from "@/lib/discord-user"
import { getGuildPresence } from "@/lib/discord-rest"

const linkSchema = z.object({ guildId: z.string().regex(/^\d{15,20}$/, "Not a Discord server id") })

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { xvmApiVenueId: true, slug: true },
    })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const parsed = linkSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }
    const { guildId } = parsed.data

    // Authority before presence before write. The posted id is never trusted: whatever the picker
    // rendered, this endpoint takes a direct POST, and linking a guild hands the caller its channel,
    // role and member names through the pickers that follow.
    try {
      if (!(await isVenueOwner(session.user.id, token, venue.xvmApiVenueId))) {
        return NextResponse.json({ error: "Only the venue owner can connect a Discord server" }, { status: 403 })
      }
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord link] membership read error")
    }

    const authority = await administersGuild(session.user.id, guildId)
    if (!authority.ok) {
      return authority.failure === "reauth_required"
        ? NextResponse.json(
            { error: "Sign out and back in, so Discord can tell us which servers you manage." },
            { status: 412 }
          )
        : NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 })
    }
    if (!authority.administers) {
      return NextResponse.json({ error: "You don't manage that Discord server." }, { status: 403 })
    }

    const presence = await getGuildPresence(guildId)
    if (!presence.botIsMember) {
      return NextResponse.json(
        { error: "bot_absent", message: "Invite the bot to that server first, then connect it." },
        { status: 409 }
      )
    }

    try {
      const link = await linkVenueExternal(token, venue.xvmApiVenueId, {
        provider: "DiscordGuild",
        external_id: guildId,
      })
      await Promise.all([invalidateCache(cacheKeys.venue(venueId)), invalidateCache(cacheKeys.venueBySlug(venue.slug))])
      return NextResponse.json(link, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord link] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (_request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { xvmApiVenueId: true, slug: true },
    })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    // No administersGuild check, unlike POST. Linking grants access to a guild's channels, roles
    // and members, so it has to be proven; unlinking only revokes that. An owner who left the
    // server or lost Manage Server is exactly who needs to undo a wrong link, and requiring
    // authority here would strand the venue on it.
    //
    // The link id is read here rather than accepted from the caller, so no request can name a row
    // this venue doesn't own.
    try {
      if (!(await isVenueOwner(session.user.id, token, venue.xvmApiVenueId))) {
        return NextResponse.json({ error: "Only the venue owner can disconnect a Discord server" }, { status: 403 })
      }
      const detail = await getVenue(token, venue.xvmApiVenueId)
      const live = detail.external_links.find(
        (link) => link.provider === "DiscordGuild" && link.unlinked_at === null
      )
      if (!live) {
        return NextResponse.json({ error: "No Discord server is connected." }, { status: 404 })
      }
      await unlinkVenueExternal(token, venue.xvmApiVenueId, live.id)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord link] DELETE error")
    }

    await Promise.all([invalidateCache(cacheKeys.venue(venueId)), invalidateCache(cacheKeys.venueBySlug(venue.slug))])
    return new NextResponse(null, { status: 204 })
  },
  { requests: 10, window: "1 m" }
)
