import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  role: vi.fn(),
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
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel, requireRoleInGuild: m.role }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listTrackedStreams: m.list,
  createTrackedStream: m.create,
}))

const CHANNEL = "1509616350337962099"
const ROLE = "1509616350337962100"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.role.mockResolvedValue({ ok: true })
})

import { GET, POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("GET /api/venues/[venueId]/tracked-streams", () => {
  it("lists the venue's tracked streams from xvm-api", async () => {
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

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost/api") as never, context as never)).status).toBe(401)
  })
})

describe("POST /api/venues/[venueId]/tracked-streams", () => {
  it("lowercases the username and creates the stream", async () => {
    m.create.mockResolvedValue({ id: 7 })
    const res = await post({ twitchUsername: "  Some_Streamer ", channelId: CHANNEL, roleId: ROLE })
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", {
      twitch_username: "some_streamer",
      channel_id: CHANNEL,
      role_id: ROLE,
    })
  })

  it("omits the role when none is chosen", async () => {
    m.create.mockResolvedValue({ id: 7 })
    await post({ twitchUsername: "streamer", channelId: CHANNEL })
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { twitch_username: "streamer", channel_id: CHANNEL })
    expect(m.role).not.toHaveBeenCalled()
  })

  it("rejects a username Twitch cannot have", async () => {
    for (const twitchUsername of ["abc", "has space", "x".repeat(26), "bad-name"]) {
      expect((await post({ twitchUsername, channelId: CHANNEL })).status).toBe(400)
    }
    expect(m.create).not.toHaveBeenCalled()
  })

  it("requires a channel", async () => {
    expect((await post({ twitchUsername: "streamer" })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await post({ twitchUsername: "streamer", channelId: CHANNEL })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a role outside the venue's server", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_not_in_guild" }, { status: 400 }) })
    expect((await post({ twitchUsername: "streamer", channelId: CHANNEL, roleId: ROLE })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
