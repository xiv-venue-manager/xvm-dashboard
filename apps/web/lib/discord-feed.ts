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
