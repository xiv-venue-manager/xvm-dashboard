import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  list: vi.fn(),
  post: vi.fn(),
  takeDown: vi.fn(),
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
  listProfilePosts: m.list,
  postProfile: m.post,
  takeDownProfile: m.takeDown,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.list.mockResolvedValue([{ channel_id: "1" }])
  m.post.mockResolvedValue(undefined)
  m.takeDown.mockResolvedValue(undefined)
})

import { GET, POST, DELETE } from "./route"

const CHANNEL = "1509616350337962099"
const context = { params: Promise.resolve({ venueId: "vn_1", profileId: "5" }) }
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("/api/venues/[venueId]/profiles/[profileId]/posts", () => {
  it("lists where the sheet is posted", async () => {
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(await res.json()).toEqual([{ channel_id: "1" }])
  })

  it("checks the channel, asks the bot to post and answers 202", async () => {
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(202)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.post).toHaveBeenCalledWith("tok", "xv-1", 5, { channel_id: CHANNEL })
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await post({ channelId: CHANNEL })).status).toBe(400)
    expect(m.post).not.toHaveBeenCalled()
  })

  it("takes the post down and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context as never)
    expect(res.status).toBe(204)
    expect(m.takeDown).toHaveBeenCalledWith("tok", "xv-1", 5)
  })
})
