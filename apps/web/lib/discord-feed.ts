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

export function postVenueGraduation(venue: { name: string; slug: string }, milestone: number) {
  postToBot("/webhook/venue-graduation", { venue, milestone })
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
