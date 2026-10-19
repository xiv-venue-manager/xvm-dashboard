import express from "express"
import { Client, GuildMember } from "discord.js"
import { postEmbed, postOrEditEmbed } from "../utils/channels.js"
import { awardXp } from "./xpWebhook.js"
import prisma from "../utils/prisma.js"
import {
  newVenueEmbed,
  venueGraduationEmbed,
  partakeDigestEmbed,
  eventLiveEmbed,
  eventsDigestDayEmbed,
  tonightListEmbed,
  regionBoardEmbed,
  announcementEmbed,
  type VenueInfo,
} from "../utils/embeds.js"
import { regionForDataCenter, REGION_LABELS, regionChannelId, dataCentersForRegion } from "../utils/regions.js"

const LOYALTY_TIERS = [
  { threshold: 150, env: "LOYALTY_GOLD_ROLE" },
  { threshold: 50, env: "LOYALTY_SILVER_ROLE" },
  { threshold: 10, env: "LOYALTY_BRONZE_ROLE" },
] as const

async function assignLoyaltyRole(client: Client, discordId: string) {
  try {
    const rows = await prisma.$queryRaw<{ visit_count: bigint }[]>`
      SELECT COUNT(*)::bigint AS visit_count
      FROM patron_logs pl
      JOIN user_characters uc ON uc."characterName" = pl."characterName" AND uc.world = pl.world
      JOIN users u ON u.id = uc."userId"
      WHERE u."discordId" = ${discordId}
        AND pl.action = 'ENTER'
    `
    const count = Number(rows[0]?.visit_count ?? 0)
    const tier = LOYALTY_TIERS.find((t) => count >= t.threshold)
    if (!tier) return

    const roleId = process.env[tier.env]
    if (!roleId) return

    const guild = client.guilds.cache.get(process.env.GUILD_ID!)
    if (!guild) return

    const member = (await guild.members.fetch(discordId).catch(() => null)) as GuildMember | null
    if (!member) return

    // Remove any lower loyalty roles, add the correct one
    const allRoleIds = LOYALTY_TIERS.map((t) => process.env[t.env]).filter(Boolean) as string[]
    const toRemove = allRoleIds.filter((id) => id !== roleId && member.roles.cache.has(id))
    if (toRemove.length) await member.roles.remove(toRemove).catch(() => null)
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId).catch(() => null)
    }
  } catch (err) {
    console.error("[Loyalty] Role assignment failed:", err)
  }
}

export function startWebhookServer(client: Client) {
  const app = express()
  app.use(express.json())

  const FEED_CHANNEL = process.env.ACTIVITY_FEED_CHANNEL_ID!
  const EVENTS_CHANNEL = process.env.EVENTS_FEED_CHANNEL_ID!
  const TONIGHT_CHANNEL = process.env.TONIGHT_CHANNEL_ID!
  const SECRET = process.env.WEBHOOK_SECRET

  // Simple shared-secret auth
  app.use((req, res, next) => {
    if (SECRET && req.headers["x-webhook-secret"] !== SECRET) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    next()
  })

  app.post("/webhook/new-venue", async (req, res) => {
    const venue: VenueInfo = req.body
    await postEmbed(client, FEED_CHANNEL, newVenueEmbed(venue))
    res.json({ ok: true })
  })

  // Manual "What's New?" style posts (previously sent by hand). Takes an
  // explicit channelId rather than a fixed env-configured channel since
  // this is posted ad hoc, not on a recurring schedule like the other
  // feed types above.
  app.post("/webhook/announcement", async (req, res) => {
    const { channelId, title, intro, sections } = req.body as {
      channelId: string
      title: string
      intro?: string
      sections: { heading: string; body: string }[]
    }
    if (!channelId || !title || !Array.isArray(sections)) {
      res.status(400).json({ error: "channelId, title, and sections are required" })
      return
    }
    await postEmbed(client, channelId, announcementEmbed({ title, intro, sections }))
    res.json({ ok: true })
  })

  app.post("/webhook/tonight", async (req, res) => {
    const venues = req.body as (VenueInfo & { scheduledStart: string; scheduledEnd: string })[]
    const parsed = venues.map((v) => ({
      ...v,
      scheduledStart: new Date(v.scheduledStart),
      scheduledEnd: new Date(v.scheduledEnd),
    }))
    await postEmbed(client, TONIGHT_CHANNEL, tonightListEmbed(parsed))
    res.json({ ok: true })
  })

  app.post("/webhook/venue-graduation", async (req, res) => {
    const { venue, milestone }: { venue: VenueInfo; milestone: number } = req.body
    await postEmbed(client, FEED_CHANNEL, venueGraduationEmbed(venue, milestone))
    res.json({ ok: true })
  })

  app.post("/webhook/partake-digest", async (req, res) => {
    const events = req.body as { title: string; startTime: string; venue: { name: string; slug: string } }[]
    await postEmbed(
      client,
      FEED_CHANNEL,
      partakeDigestEmbed(events.map((e) => ({ ...e, startTime: new Date(e.startTime) })))
    )
    res.json({ ok: true })
  })

  app.post("/webhook/patron-visit-xp", async (req, res) => {
    const { discordId, venueName } = req.body as { discordId: string; venueName: string }
    if (!discordId) {
      res.status(400).json({ error: "discordId required" })
      return
    }
    await awardXp(client, discordId, 100, `visited ${venueName}`)
    await assignLoyaltyRole(client, discordId)
    res.json({ ok: true })
  })

  app.post("/webhook/shift-xp", async (req, res) => {
    const { discordId, venueName } = req.body as { discordId: string; venueName: string }
    if (!discordId) {
      res.status(400).json({ error: "discordId required" })
      return
    }
    await awardXp(client, discordId, 200, `worked a shift at ${venueName}`)
    res.json({ ok: true })
  })

  app.post("/webhook/event-live", async (req, res) => {
    const { event } = req.body as { event: { title: string; startTime: string; endTime: string; venue: VenueInfo } }
    const parsed = { ...event, startTime: new Date(event.startTime), endTime: new Date(event.endTime) }
    await postEmbed(client, FEED_CHANNEL, eventLiveEmbed(parsed))
    if (EVENTS_CHANNEL) await postEmbed(client, EVENTS_CHANNEL, eventLiveEmbed(parsed))
    res.json({ ok: true })
  })

  app.post("/webhook/events-digest", async (req, res) => {
    const { dayOffset, dayLabel, events, truncatedCount } = req.body as {
      dayOffset: number
      dayLabel: string
      events: { title: string; startTime: string; venue: { name: string; slug: string } }[]
      truncatedCount: number
    }
    const parsed = events.map((e) => ({ ...e, startTime: new Date(e.startTime) }))
    await postOrEditEmbed(
      client,
      `events:day-${dayOffset}`,
      EVENTS_CHANNEL,
      eventsDigestDayEmbed(dayLabel, parsed, truncatedCount)
    )
    res.json({ ok: true })
  })

  app.post("/webhook/venue-status", async (req, res) => {
    const { venueId, venueName, dataCenter, isOpen } = req.body as {
      venueId: string
      venueName: string
      dataCenter: string
      isOpen: boolean
    }

    const region = regionForDataCenter(dataCenter)
    if (!region) {
      console.warn(`[venue-status] Unknown data center "${dataCenter}" for venue ${venueName}, skipping`)
      res.json({ ok: true, skipped: true })
      return
    }

    const existing = await prisma.openVenue.findUnique({ where: { venueId } })
    const wasOpen = existing !== null

    if (isOpen === wasOpen) {
      // No transition — a second staff member clocking into an already-open
      // venue, or a clock-out that isn't the last active shift, shouldn't
      // trigger a re-render.
      res.json({ ok: true, changed: false })
      return
    }

    if (isOpen) {
      await prisma.openVenue
        .upsert({
          where: { venueId },
          create: { venueId, venueName, dataCenter },
          update: { venueName, dataCenter },
        })
        .catch(() => null)
    } else {
      await prisma.openVenue.delete({ where: { venueId } }).catch(() => null)
    }

    const openInRegion = await prisma.openVenue.findMany({
      where: { dataCenter: { in: dataCentersForRegion(region) } },
    })

    await postOrEditEmbed(
      client,
      `region:${region}`,
      regionChannelId(region),
      regionBoardEmbed(REGION_LABELS[region], openInRegion)
    )

    res.json({ ok: true, changed: true })
  })

  const port = parseInt(process.env.WEBHOOK_PORT ?? "4567")
  const host = process.env.WEBHOOK_HOST ?? "127.0.0.1"
  const server = app.listen(port, host, () => console.log(`[Webhook] Listening on ${host}:${port}`))
  server.unref() // allow process to exit cleanly on SIGTERM without hanging

  const shutdown = () => {
    server.close()
    client.destroy()
    process.exit(0)
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
}
