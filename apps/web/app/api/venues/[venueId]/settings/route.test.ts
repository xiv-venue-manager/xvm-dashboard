import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
  venueFind: vi.fn(),
  venueUpdate: vi.fn(),
  channel: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFind, update: m.venueUpdate } } }))
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenueRole: m.role }))
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: vi.fn(),
  invalidateXvmApiCredential: vi.fn(),
  isXvmAuthFailure: vi.fn(),
  xvmApiErrorResponse: vi.fn(),
}))

import { GET, PUT } from "./route"
import { getDefaultVenueSettings } from "@/lib/types/venue-settings"

const CHANNEL = "1509616350337962099"
const OLD_CHANNEL = "1409616350337962011"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const shiftBot = (channelId: string) => ({ enabled: true, channelId, templates: [] })
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.role.mockResolvedValue({ ok: true, venue: { id: "xv-1", role: "OWNER" } })
  m.venueFind.mockResolvedValue({
    id: "vn_1",
    settings: { shiftBot: shiftBot(OLD_CHANNEL) },
    venueType: null,
  })
  m.venueUpdate.mockResolvedValue({ settings: {} })
  m.channel.mockResolvedValue({ ok: true })
})

describe("PUT /api/venues/[venueId]/settings, shift bot channel", () => {
  it("checks a channel that changed against the venue's xvm-api id, and saves it when it is in the venue's server", async () => {
    const res = await put({ shiftBot: shiftBot(CHANNEL) })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledWith("user-1", "xv-1", CHANNEL)
    expect(m.venueUpdate).toHaveBeenCalledTimes(1)
  })

  it("is 404 when the xvm-api venue has no dashboard settings row, and saves nothing", async () => {
    m.venueFind.mockResolvedValue(null)
    const res = await put({ shiftBot: shiftBot(CHANNEL) })
    expect(res.status).toBe(404)
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("looks the settings row up by the xvm-api venue id", async () => {
    await put({ tagline: "Open nightly" })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", "STAFF", expect.any(String), expect.any(String))
    expect(m.venueFind).toHaveBeenCalledWith(expect.objectContaining({ where: { xvmApiVenueId: "xv-1" } }))
    expect(m.venueUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vn_1" } }))
  })

  it("refuses a changed channel that is outside the venue's server, and saves nothing", async () => {
    m.channel.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }),
    })
    const res = await put({ shiftBot: shiftBot(CHANNEL) })
    expect(res.status).toBe(400)
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("does not re-check a channel that has not changed", async () => {
    // The whole shiftBot object is sent on every save, so re-checking would block an unrelated
    // edit on a venue whose server was never linked.
    const res = await put({ shiftBot: shiftBot(OLD_CHANNEL) })
    expect(res.status).toBe(200)
    expect(m.channel).not.toHaveBeenCalled()
  })

  it("does not check a cleared channel", async () => {
    const res = await put({ shiftBot: shiftBot("") })
    expect(res.status).toBe(200)
    expect(m.channel).not.toHaveBeenCalled()
  })

  it("refuses a channel id that is not a snowflake, before anything reaches Discord", async () => {
    // requireChannelInGuild hands this to getChannelInfo, which interpolates it into
    // /channels/{id}. ".." segments resolve in a URL, so an unvalidated value could address a
    // different Discord endpoint with the bot token attached. The schema refuses it first.
    const res = await put({ shiftBot: shiftBot("../users/@me") })
    expect(res.status).toBe(400)
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("does not check a save that has no shift bot in it", async () => {
    await put({ tagline: "Open nightly" })
    expect(m.channel).not.toHaveBeenCalled()
  })
})

describe("venue webhook settings are retired", () => {
  const stored = {
    ...getDefaultVenueSettings(),
    tagline: "Old",
    webhooks: { saleLogged: true },
    discordWebhooks: { staff: "https://discord.com/api/webhooks/1/a", events: "", revenue: "" },
  }

  it("accepts a PUT that still carries webhook fields, drops them, and keeps the stored ones", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    const res = await put({
      tagline: "New",
      webhooks: { saleLogged: false },
      discordWebhooks: { staff: "https://discord.com/api/webhooks/2/b" },
      discordWebhookUrl: "https://discord.com/api/webhooks/3/c",
    })
    expect(res.status).toBe(200)
    const data = m.venueUpdate.mock.calls[0][0].data
    expect(data).not.toHaveProperty("discordWebhookUrl")
    expect(data.settings.tagline).toBe("New")
    expect(data.settings.webhooks).toEqual(stored.webhooks)
    expect(data.settings.discordWebhooks).toEqual(stored.discordWebhooks)
    expect(m.venueUpdate.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("ignores room manager roles from an older page and stores none", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    const res = await put({ tagline: "New", roomManagerRoleIds: ["role-1"] })
    expect(res.status).toBe(200)
    const data = m.venueUpdate.mock.calls[0][0].data
    expect(data.settings.tagline).toBe("New")
    expect(data.settings).not.toHaveProperty("roomManagerRoleIds")
  })

  it("does not return a discordWebhookUrl from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null, froggeToken: null })
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty("discordWebhookUrl")
    expect(m.venueFind.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("serves no stored webhook address from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null, froggeToken: null })
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body.tagline).toBe("Old")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })

  it("serves no stored webhook address from PUT", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    m.venueUpdate.mockResolvedValue({ settings: { ...stored, tagline: "New" } })
    const body = await (await put({ tagline: "New" })).json()
    expect(body.tagline).toBe("New")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })
})
