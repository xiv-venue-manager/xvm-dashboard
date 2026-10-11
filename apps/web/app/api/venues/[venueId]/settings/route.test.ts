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
vi.mock("@/lib/api/venue-access", () => ({ requireVenueRole: m.role }))
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: vi.fn(),
  invalidateXvmApiCredential: vi.fn(),
  isXvmAuthFailure: vi.fn(),
  xvmApiErrorResponse: vi.fn(),
}))

import { PUT } from "./route"

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
  m.role.mockResolvedValue({ ok: true, role: "OWNER" })
  m.venueFind.mockResolvedValue({
    settings: { shiftBot: shiftBot(OLD_CHANNEL) },
    xvmApiVenueId: null,
    venueType: null,
  })
  m.venueUpdate.mockResolvedValue({ settings: {}, discordWebhookUrl: null, partakeTeamId: null })
  m.channel.mockResolvedValue({ ok: true })
})

describe("PUT /api/venues/[venueId]/settings, shift bot channel", () => {
  it("checks a channel that changed, and saves it when it is in the venue's server", async () => {
    const res = await put({ shiftBot: shiftBot(CHANNEL) })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
    expect(m.venueUpdate).toHaveBeenCalledTimes(1)
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
