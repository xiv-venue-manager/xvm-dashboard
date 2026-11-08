import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  manager: vi.fn(),
  token: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  role: vi.fn(),
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

vi.mock("@/lib/api/venue-guild", () => ({ requireRoleInGuild: m.role }))

import { GET, PUT } from "./route"

const CHANNEL = "1509616350337962024"
const NEW_ROLE = "1509616350337962999"
const context = { params: Promise.resolve({ venueId: "the-lilypad-lounge" }) }
const get = () => GET(new Request("http://localhost/api") as never, context as never)
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)
const row = {
  honeypot_channel_id: CHANNEL,
  events_channel_id: null,
  rooms_channel_id: null,
  verified_role_id: CHANNEL,
  verification_captcha: true,
  verification_lodestone: "code",
  verification_nickname: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.member.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "STAFF" } })
  m.manager.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "MANAGER" } })
  m.token.mockResolvedValue("tok")
  m.read.mockResolvedValue(row)
  m.write.mockResolvedValue(row)
  m.role.mockResolvedValue({ ok: true })
})

describe("GET discord/settings", () => {
  it("serves the channels and verification settings under the dashboard's own names, for any member", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      honeypotChannelId: CHANNEL,
      eventsChannelId: null,
      roomsChannelId: null,
      verifiedRoleId: CHANNEL,
      verificationCaptcha: true,
      verificationLodestone: "code",
      verificationNickname: false,
    })
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

  it("forwards verification settings in snake_case", async () => {
    await put({ verifiedRoleId: CHANNEL, verificationCaptcha: true, verificationLodestone: "exists" })
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", {
      verified_role_id: CHANNEL,
      verification_captcha: true,
      verification_lodestone: "exists",
    })
  })

  it("checks a changed verified role against the venue's server before xvm-api is asked", async () => {
    const res = await put({ verifiedRoleId: NEW_ROLE })
    expect(res.status).toBe(200)
    expect(m.role).toHaveBeenCalledWith("user-1", "the-lilypad-lounge", NEW_ROLE, CHANNEL)
    expect(m.role.mock.invocationCallOrder[0]).toBeLessThan(m.write.mock.invocationCallOrder[0])
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", { verified_role_id: NEW_ROLE })
  })

  it("passes a refusal on unchanged and sends nothing", async () => {
    const refusal = { error: "role_unsafe", message: "That role can't be given out automatically: it has Administrator." }
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json(refusal, { status: 400 }) })
    const res = await put({ verifiedRoleId: NEW_ROLE, verificationCaptcha: true })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(refusal)
    expect(m.write).not.toHaveBeenCalled()
  })

  it("sends nothing when the server cannot be reached", async () => {
    m.role.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "bot_absent", message: "The bot isn't in this server." }, { status: 409 }),
    })
    expect((await put({ verifiedRoleId: NEW_ROLE })).status).toBe(409)
    expect(m.write).not.toHaveBeenCalled()
  })

  it("does not check a role the venue already holds", async () => {
    await put({ verifiedRoleId: CHANNEL, verificationCaptcha: true })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", { verified_role_id: CHANNEL, verification_captcha: true })
  })

  it("checks a role against nothing when the venue has none saved", async () => {
    m.read.mockResolvedValue({ ...row, verified_role_id: null })
    await put({ verifiedRoleId: NEW_ROLE })
    expect(m.role).toHaveBeenCalledWith("user-1", "the-lilypad-lounge", NEW_ROLE, null)
  })

  it("reports an xvm-api failure while reading the saved role, and writes nothing", async () => {
    m.read.mockRejectedValue(new Error("down"))
    expect((await put({ verifiedRoleId: NEW_ROLE })).status).toBe(502)
    expect(m.role).not.toHaveBeenCalled()
    expect(m.write).not.toHaveBeenCalled()
  })

  it("asks Discord and the saved settings nothing for a body without the role", async () => {
    await put({ honeypotChannelId: CHANNEL })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.read).not.toHaveBeenCalled()
  })

  it("clears the verified role with null", async () => {
    await put({ verifiedRoleId: null })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.read).not.toHaveBeenCalled()
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", { verified_role_id: null })
  })

  it("turns Change Nickname off together with the Lodestone check", async () => {
    await put({ verificationLodestone: "off" })
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", {
      verification_lodestone: "off",
      verification_nickname: false,
    })
  })

  it("keeps a nickname value the body sets itself when the check goes off", async () => {
    await put({ verificationLodestone: "off", verificationNickname: true })
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", {
      verification_lodestone: "off",
      verification_nickname: true,
    })
  })

  it("leaves the nickname alone when the check stays on", async () => {
    await put({ verificationLodestone: "code" })
    expect(m.write).toHaveBeenCalledWith("tok", "ven_1", { verification_lodestone: "code" })
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
    ["a check that is not offered", { verificationLodestone: "profile" }],
    ["a captcha that is not a boolean", { verificationCaptcha: "yes" }],
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
