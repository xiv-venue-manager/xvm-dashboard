import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  guild: vi.fn(),
  channel: vi.fn(),
  update: vi.fn(),
  stored: vi.fn(),
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
  updateLevelingSettings: m.update,
  getLevelingSettings: m.stored,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.update.mockResolvedValue({})
  m.stored.mockResolvedValue({
    xp_name: "XP",
    curve_quadratic: 5,
    curve_linear: 50,
    announcement_channel_id: null,
    excluded_channel_ids: [],
    excluded_role_ids: [],
    voice_needs_company: true,
  })
})

import { PUT } from "./route"

const ANNOUNCE = "1509616350337962099"
const QUIET = "1509616350337962100"
const ROLE = "1509616350337962101"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/leveling/settings", () => {
  it("saves every setting under xvm-api's names after checking each channel", async () => {
    const res = await put({
      xpName: "Stars",
      curveQuadratic: 4,
      curveLinear: 20,
      announcementChannelId: ANNOUNCE,
      excludedChannelIds: [QUIET],
      excludedRoleIds: [ROLE],
      voiceNeedsCompany: false,
    })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", ANNOUNCE)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", QUIET)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", {
      xp_name: "Stars",
      curve_quadratic: 4,
      curve_linear: 20,
      announcement_channel_id: ANNOUNCE,
      excluded_channel_ids: [QUIET],
      excluded_role_ids: [ROLE],
      voice_needs_company: false,
    })
  })

  it("turns announcements off with a null channel without a Discord check", async () => {
    await put({ announcementChannelId: null })
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", { announcement_channel_id: null })
  })

  it("sends only the fields it was given and never reads the stored settings for them", async () => {
    await put({ curveLinear: 0 })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", { curve_linear: 0 })
    expect(m.stored).not.toHaveBeenCalled()
  })

  it("does not re-check stored channels but checks a newly added one", async () => {
    m.stored.mockResolvedValue({
      xp_name: "XP",
      curve_quadratic: 5,
      curve_linear: 50,
      announcement_channel_id: ANNOUNCE,
      excluded_channel_ids: [QUIET],
      excluded_role_ids: [],
      voice_needs_company: true,
    })
    const ADDED = "1509616350337962102"
    const res = await put({ announcementChannelId: ANNOUNCE, excludedChannelIds: [QUIET, ADDED] })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledTimes(1)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", ADDED)
  })

  it("rejects a curve outside xvm-api's limits and an empty body", async () => {
    expect((await put({ curveQuadratic: 0 })).status).toBe(400)
    expect((await put({ xpName: "" })).status).toBe(400)
    expect((await put({})).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses an excluded channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await put({ excludedChannelIds: [QUIET] })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await put({ xpName: "Stars" })).status).toBe(401)
  })
})
