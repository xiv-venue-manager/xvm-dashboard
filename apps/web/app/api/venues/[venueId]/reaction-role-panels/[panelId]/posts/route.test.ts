import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  venue: vi.fn(),
  channel: vi.fn(),
  postPanel: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  postPanel: m.postPanel,
}))

import { POST } from "./route"

const CHANNEL = "1509616350337962099"
const context = { params: Promise.resolve({ venueId: "vn_1", panelId: "5" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.channel.mockResolvedValue({ ok: true })
  m.postPanel.mockResolvedValue(undefined)
})

describe("POST /api/venues/[venueId]/reaction-role-panels/[panelId]/posts", () => {
  it("posts when the channel is in the venue's server", async () => {
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(202)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.postPanel).toHaveBeenCalledWith("tok", "xv-1", 5, { channel_id: CHANNEL })
  })

  it("refuses a channel outside the venue's server without telling the bot to post", async () => {
    m.channel.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }),
    })
    const res = await post({ channelId: CHANNEL })
    expect(res.status).toBe(400)
    expect(m.postPanel).not.toHaveBeenCalled()
  })

  it("does not check the channel for a malformed id", async () => {
    expect((await post({ channelId: "not-a-number" })).status).toBe(400)
    expect(m.channel).not.toHaveBeenCalled()
  })
})
