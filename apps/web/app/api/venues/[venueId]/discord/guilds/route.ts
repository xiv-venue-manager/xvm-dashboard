import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue } from "@/lib/api/xvm-api"
import { listManageableGuilds } from "@/lib/discord-user"

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (_request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (membership?.role !== "OWNER") {
      return NextResponse.json({ error: "Only the venue owner can connect a Discord server" }, { status: 403 })
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
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

    let currentGuildId: string | null
    try {
      const detail = await getVenue(token, venue.xvmApiVenueId)
      currentGuildId =
        detail.external_links.find((link) => link.provider === "DiscordGuild" && link.unlinked_at === null)
          ?.external_id ?? null
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[discord guilds] venue read error")
    }

    const manageable = await listManageableGuilds(session.user.id)

    // reauth_required is a state of the caller's account, not a failure, so it answers 200 with the
    // current link still rendered and a prompt. discord_unavailable is Discord being broken, which
    // the UI has to say differently - and which must not read as "you administer no servers".
    if (!manageable.ok && manageable.failure === "discord_unavailable") {
      return NextResponse.json({ error: "Couldn't reach Discord. Try again in a moment." }, { status: 502 })
    }

    return NextResponse.json({
      currentGuildId,
      needsReauth: !manageable.ok,
      guilds: manageable.ok ? manageable.guilds : [],
    })
  },
  { requests: 20, window: "1 m" }
)
