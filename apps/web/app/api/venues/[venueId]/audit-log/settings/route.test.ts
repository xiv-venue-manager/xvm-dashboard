import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  setChannel: vi.fn(),
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
  setAuditLogChannel: m.setChannel,
}))

const CHANNEL = "1509616350337962099"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
})

import { PUT } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/audit-log/settings", () => {
  it("sets the channel after checking it is in the venue's server", async () => {
    m.setChannel.mockResolvedValue({ channel_id: CHANNEL })
    const res = await put({ channelId: CHANNEL })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.setChannel).toHaveBeenCalledWith("tok", "xv-1", CHANNEL)
  })

  it("clears the channel with null without a Discord check", async () => {
    m.setChannel.mockResolvedValue({ channel_id: null })
    expect((await put({ channelId: null })).status).toBe(200)
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.setChannel).toHaveBeenCalledWith("tok", "xv-1", null)
  })

  it("requires the channelId key", async () => {
    expect((await put({})).status).toBe(400)
    expect(m.setChannel).not.toHaveBeenCalled()
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await put({ channelId: CHANNEL })).status).toBe(400)
    expect(m.setChannel).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await put({ channelId: CHANNEL })).status).toBe(401)
  })
})
