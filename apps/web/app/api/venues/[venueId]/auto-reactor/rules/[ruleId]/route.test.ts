import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
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
  updateAutoReactorRule: m.update,
  deleteAutoReactorRule: m.remove,
}))

const CHANNEL = "1509616350337962099"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
})

import { PATCH, DELETE } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", ruleId: "7" }) }
const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context as never)

describe("PATCH /api/venues/[venueId]/auto-reactor/rules/[ruleId]", () => {
  it("passes a null through so a condition is cleared", async () => {
    m.update.mockResolvedValue({ id: 7 })
    expect((await patch({ keyword: null, channelId: null })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { keyword: null, channel_id: null })
  })

  it("sends only the fields that were given", async () => {
    m.update.mockResolvedValue({ id: 7 })
    await patch({ emoji: "🐸" })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { emoji: "🐸" })
  })

  it("checks a new channel is in the venue's server", async () => {
    m.update.mockResolvedValue({ id: 7 })
    await patch({ channelId: CHANNEL })
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", CHANNEL)
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await patch({ channelId: CHANNEL })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses a rule id that is not a number", async () => {
    const res = await PATCH(
      new Request("http://localhost/api", { method: "PATCH", body: "{}" }) as never,
      { params: Promise.resolve({ venueId: "vn_1", ruleId: "abc" }) } as never
    )
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/venues/[venueId]/auto-reactor/rules/[ruleId]", () => {
  it("deletes the rule and answers 204", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 7)
  })
})
