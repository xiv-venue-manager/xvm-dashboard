import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  manager: vi.fn(),
  token: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.member, requireMyVenueRole: m.manager }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: async () => NextResponse.json({ error: "upstream" }, { status: 502 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ getDiscordSettings: m.read, updateDiscordSettings: m.write }))

import { GET, PUT } from "./route"

const CHANNEL = "1509616350337962024"
const context = { params: Promise.resolve({ venueId: "the-lilypad-lounge" }) }
const get = () => GET(new Request("http://localhost/api") as never, context as never)
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)
const row = { honeypot_channel_id: CHANNEL, events_channel_id: null, rooms_channel_id: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.member.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "STAFF" } })
  m.manager.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "MANAGER" } })
  m.token.mockResolvedValue("tok")
  m.read.mockResolvedValue(row)
  m.write.mockResolvedValue(row)
})

describe("GET discord/settings", () => {
  it("serves the three channels under the dashboard's own names, for any member", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ honeypotChannelId: CHANNEL, eventsChannelId: null, roomsChannelId: null })
    expect(m.read).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("refuses without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.read).not.toHaveBeenCalled()
  })

  it("passes a failed venue lookup straight through", async () => {
    m.member.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect(m.read).not.toHaveBeenCalled()
  })

  it("reports an xvm-api failure", async () => {
    m.read.mockRejectedValue(new Error("down"))
    expect((await get()).status).toBe(502)
  })
})

describe("PUT discord/settings", () => {
  it("sends only the fields given, and null to clear", async () => {
    const res = await put({ honeypotChannelId: CHANNEL, eventsChannelId: null })
    expect(res.status).toBe(200)
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", { honeypot_channel_id: CHANNEL, events_channel_id: null })
  })

  it("asks for a manager, and writes nothing for a lesser role", async () => {
    m.manager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "no" }, { status: 403 }) })
    expect((await put({ roomsChannelId: CHANNEL })).status).toBe(403)
    expect(m.manager.mock.calls[0][2]).toBe("MANAGER")
    expect(m.write).not.toHaveBeenCalled()
  })

  it.each([
    ["a number, which would round past 2^53", { honeypotChannelId: 1509616350337962024 }],
    ["something that is not an id", { eventsChannelId: "general" }],
    ["an id too large for xvm-api's 64-bit column", { roomsChannelId: "9223372036854775808" }],
  ])("rejects %s", async (_label, body) => {
    expect((await put(body)).status).toBe(400)
    expect(m.write).not.toHaveBeenCalled()
  })

  it("rejects a body that changes nothing", async () => {
    expect((await put({})).status).toBe(400)
    expect((await put({ unrelated: "x" })).status).toBe(400)
    expect(m.write).not.toHaveBeenCalled()
  })

  it("refuses without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await put({ honeypotChannelId: CHANNEL })).status).toBe(401)
  })

  it("reports an xvm-api failure", async () => {
    m.write.mockRejectedValue(new Error("down"))
    expect((await put({ honeypotChannelId: CHANNEL })).status).toBe(502)
  })
})
