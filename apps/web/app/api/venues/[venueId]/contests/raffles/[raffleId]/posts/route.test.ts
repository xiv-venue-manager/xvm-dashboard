import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  post: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  postRaffle: m.post,
}))

import { POST } from "./route"

const CHANNEL = "1509616350337962099"
const context = { params: Promise.resolve({ venueId: "vn_1", raffleId: "5" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.post.mockResolvedValue(undefined)
})

describe("POST /api/venues/[venueId]/contests/raffles/[raffleId]/posts", () => {
  it("posts when the channel is in the venue's server", async () => {
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(202)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.post).toHaveBeenCalledWith("tok", "xv-1", 5, { channel_id: CHANNEL })
  })

  it("refuses a channel outside the venue's server without telling the bot to post", async () => {
    m.channel.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }),
    })
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(400)
    expect(m.post).not.toHaveBeenCalled()
  })

  it("does not check the channel for a malformed id", async () => {
    expect((await post({ channelId: "not-a-number" })).status).toBe(400)
    expect(m.channel).not.toHaveBeenCalled()
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await post({ channelId: CHANNEL })).status).toBe(404)
    expect(m.post).not.toHaveBeenCalled()
  })
})
