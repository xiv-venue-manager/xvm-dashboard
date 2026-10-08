import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { acceptInvite, getMe } from "@/lib/api/xvm-api"
import {
  sendDiscordWebhook,
  formatStaffJoinedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { notifyVenueOwners } from "@/lib/notify"
import { resolveDisplayName } from "@/lib/display-name"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in to accept an invite" }, { status: 401 })
  }

  const { token } = await params

  const personToken = await getValidXvmApiToken(session.user.id)
  if (!personToken) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  try {
    const membership = await acceptInvite(personToken, token)

    await invalidateCache(cacheKeys.userVenues(session.user.id))

    const venue = await prisma.venue.findFirst({
      where: { xvmApiVenueId: membership.venue_id },
      select: { id: true, name: true, slug: true, discordWebhookUrl: true, settings: true },
    })
    if (!venue) {
      // The membership exists in xvm-api; the dashboard just doesn't know this
      // venue yet. Still a success from the invitee's point of view.
      return NextResponse.json({
        success: true,
        membership: { id: membership.id, role: membership.tier.toUpperCase() },
        venue: null,
      })
    }

    notifyVenueOwners(venue.id, {
      type: "STAFF_JOINED",
      title: "New staff member",
      body: `${session.user.name ?? "Someone"} joined ${venue.name} as ${membership.tier}.`,
      link: `/dashboard/${venue.slug}/staff`,
    }).catch(() => {})

    const venueSettings = venue.settings as Record<string, unknown> | null
    const webhookConfig: VenueWebhookConfig = {
      discordWebhooks: venueSettings?.discordWebhooks as VenueWebhookConfig["discordWebhooks"],
      webhooks: venueSettings?.webhooks as VenueWebhookConfig["webhooks"],
      discordWebhookUrl: venue.discordWebhookUrl,
    }
    const webhookUrl = getWebhookUrlForType(webhookConfig, "staffJoined")
    if (webhookUrl) {
      const me = await getMe(personToken).catch(() => null)
      const embed = formatStaffJoinedEmbed({
        name: resolveDisplayName({
          nickname: membership.nickname,
          discordName: me?.person?.display_name ?? session.user.name,
        }),
        role: membership.tier,
      })
      sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
        console.error("Failed to send Discord webhook:", error)
      )
    }

    return NextResponse.json({
      success: true,
      membership: { id: membership.id, role: membership.tier.toUpperCase() },
      venue: { name: venue.name, slug: venue.slug },
    })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[invites/accept] POST error")
  }
}
