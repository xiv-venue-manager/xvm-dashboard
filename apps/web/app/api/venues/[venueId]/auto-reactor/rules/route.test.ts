import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
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
  listAutoReactorRules: m.list,
  createAutoReactorRule: m.create,
}))

const CHANNEL = "1509616350337962099"
const ROLE = "1509616350337962100"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
})

import { GET, POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("GET /api/venues/[venueId]/auto-reactor/rules", () => {
  it("lists the venue's rules from xvm-api", async () => {
    m.list.mockResolvedValue([{ id: 1 }])
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(await res.json()).toEqual([{ id: 1 }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1")
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await GET(new Request("http://localhost/api") as never, context as never)).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })
})

describe("POST /api/venues/[venueId]/auto-reactor/rules", () => {
  it("creates a rule, sending only the conditions that are set", async () => {
    m.create.mockResolvedValue({ id: 2 })
    const res = await post({ emoji: "👍", keyword: "gg" })
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { keyword: "gg", emoji: "👍" })
    expect(m.channel).not.toHaveBeenCalled()
  })

  it("creates a draft when no condition is given", async () => {
    m.create.mockResolvedValue({ id: 3 })
    expect((await post({ emoji: "❓" })).status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { emoji: "❓" })
  })

  it("checks the channel is in the venue's server before creating", async () => {
    m.create.mockResolvedValue({ id: 4 })
    await post({ emoji: "👍", channelId: CHANNEL, roleId: ROLE })
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { channel_id: CHANNEL, role_id: ROLE, emoji: "👍" })
  })

  it("refuses a channel outside the venue's server without calling xvm-api", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await post({ emoji: "👍", channelId: CHANNEL })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a missing emoji and a malformed channel id", async () => {
    expect((await post({ keyword: "gg" })).status).toBe(400)
    expect((await post({ emoji: "👍", channelId: "not-a-number" })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
