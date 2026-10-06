import { prisma } from "@/lib/prisma"

const BOT_URL = process.env.EORZEA_BOT_WEBHOOK_URL
const BOT_SECRET = process.env.EORZEA_BOT_WEBHOOK_SECRET

function postToBot(path: string, body: unknown) {
  if (!BOT_URL) return Promise.resolve()
  return fetch(`${BOT_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": BOT_SECRET ?? "",
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export function postNewVenue(venue: {
  name: string
  slug: string
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
}) {
  postToBot("/webhook/new-venue", venue)
}

export function postPartakeDigest(events: { title: string; startTime: Date; venue: { name: string; slug: string } }[]) {
  postToBot(
    "/webhook/partake-digest",
    events.map((e) => ({ ...e, startTime: e.startTime.toISOString() }))
  )
}

export function postVenueGraduation(venue: { name: string; slug: string }, milestone: number) {
  postToBot("/webhook/venue-graduation", { venue, milestone })
}

export function postTonightList(
  venues: {
    name: string
    slug: string
    dataCenter: string
    world: string
    district?: string | null
    ward?: number | null
    plot?: number | null
    scheduledStart: Date
    scheduledEnd: Date
  }[]
) {
  postToBot(
    "/webhook/tonight",
    venues.map((v) => ({
      ...v,
      scheduledStart: v.scheduledStart.toISOString(),
      scheduledEnd: v.scheduledEnd.toISOString(),
    }))
  )
}

export async function postPatronVisitXp(venueId: string, characterName: string, world: string) {
  const rows = await prisma.$queryRaw<{ discordId: string | null; name: string }[]>`
    SELECT u."discordId", v.name
    FROM user_characters uc
    JOIN users u ON u.id = uc."userId"
    JOIN venues v ON v.id = ${venueId}
    WHERE uc."characterName" = ${characterName}
      AND uc.world = ${world}
    LIMIT 1
  `
  const row = rows[0]
  if (!row?.discordId) return
  postToBot("/webhook/patron-visit-xp", { discordId: row.discordId, venueName: row.name })
}

export async function postShiftXp(userId: string, venueId: string) {
  const rows = await prisma.$queryRaw<{ discordId: string | null; name: string }[]>`
    SELECT u."discordId", v.name
    FROM users u
    JOIN venues v ON v.id = ${venueId}
    WHERE u.id = ${userId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row?.discordId) return
  postToBot("/webhook/shift-xp", { discordId: row.discordId, venueName: row.name })
}

export function postEventsDigestDay(
  dayOffset: number,
  dayLabel: string,
  events: { title: string; startTime: Date; venue: { name: string; slug: string } }[],
  truncatedCount: number
) {
  return postToBot("/webhook/events-digest", {
    dayOffset,
    dayLabel,
    truncatedCount,
    events: events.map((e) => ({ ...e, startTime: e.startTime.toISOString() })),
  })
}

export function postVenueStatus(venue: { id: string; name: string; dataCenter: string }, isOpen: boolean) {
  postToBot("/webhook/venue-status", {
    venueId: venue.id,
    venueName: venue.name,
    dataCenter: venue.dataCenter,
    isOpen,
  })
}

export function postEventLive(event: {
  title: string
  startTime: Date
  endTime: Date
  venue: {
    name: string
    slug: string
    dataCenter: string
    world: string
    district?: string | null
    ward?: number | null
    plot?: number | null
  }
}) {
  postToBot("/webhook/event-live", {
    event: {
      ...event,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
    },
  })
}
