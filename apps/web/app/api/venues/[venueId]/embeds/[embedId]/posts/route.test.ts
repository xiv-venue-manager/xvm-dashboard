import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  list: vi.fn(),
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
  listEmbedPosts: m.list,
  postEmbed: m.post,
}))

import { GET, POST } from "./route"

const CHANNEL = "1509616350337962099"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.list.mockResolvedValue([{ channel_id: CHANNEL, message_id: "5", posted_at: null }])
  m.post.mockResolvedValue(undefined)
})

const context = (embedId: string) => ({ params: Promise.resolve({ venueId: "vn_1", embedId }) })
const get = (embedId = "4") => GET(new Request("http://localhost/api") as never, context(embedId) as never)
const post = (body: unknown, embedId = "4") =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context(embedId) as never)

describe("GET /api/venues/[venueId]/embeds/[embedId]/posts", () => {
  it("lists where the embed is posted", async () => {
    const res = await get()
    expect(await res.json()).toEqual([{ channel_id: CHANNEL, message_id: "5", posted_at: null }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", 4)
  })

  it("rejects an id that is not a whole number", async () => {
    expect((await get("abc")).status).toBe(400)
    expect(m.list).not.toHaveBeenCalled()
  })
})

describe("POST /api/venues/[venueId]/embeds/[embedId]/posts", () => {
  it("posts after checking the channel is in the venue's server, and answers 202", async () => {
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(202)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.post).toHaveBeenCalledWith("tok", "xv-1", 4, CHANNEL)
  })

  it("requires a channel id", async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ channelId: "abc" })).status).toBe(400)
    expect(m.post).not.toHaveBeenCalled()
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await post({ channelId: CHANNEL })).status).toBe(400)
    expect(m.post).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post({ channelId: CHANNEL })).status).toBe(401)
  })
})
