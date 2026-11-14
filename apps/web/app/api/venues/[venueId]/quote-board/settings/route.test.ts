import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
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
  updateQuoteBoardSettings: m.update,
  getQuoteBoardSettings: m.stored,
}))

const BOARD = "1509616350337962099"
const IGNORED = "1509616350337962100"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.update.mockResolvedValue({})
  m.stored.mockResolvedValue({
    board_channel_id: null,
    emoji: "x",
    reaction_threshold: 1,
    allow_nsfw_sources: false,
    blacklisted_channel_ids: [],
  })
})

import { PUT } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/quote-board/settings", () => {
  it("saves every setting under xvm-api's names after checking each channel", async () => {
    const res = await put({
      boardChannelId: BOARD,
      emoji: "\u{1F4AC}",
      reactionThreshold: 3,
      allowNsfwSources: true,
      blacklistedChannelIds: [IGNORED],
    })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", BOARD)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", IGNORED)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", {
      board_channel_id: BOARD,
      emoji: "\u{1F4AC}",
      reaction_threshold: 3,
      allow_nsfw_sources: true,
      blacklisted_channel_ids: [IGNORED],
    })
  })

  it("turns the board off with a null channel without a Discord check", async () => {
    await put({ boardChannelId: null })
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", { board_channel_id: null })
  })

  it("sends only the fields it was given", async () => {
    await put({ reactionThreshold: 5 })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", { reaction_threshold: 5 })
  })

  it("does not re-check stored channels but checks a newly added one", async () => {
    const ADDED = "1509616350337962101"
    m.stored.mockResolvedValue({
      board_channel_id: BOARD,
      emoji: "x",
      reaction_threshold: 1,
      allow_nsfw_sources: false,
      blacklisted_channel_ids: [IGNORED],
    })
    const res = await put({ boardChannelId: BOARD, blacklistedChannelIds: [IGNORED, ADDED] })
    expect(res.status).toBe(200)
    expect(m.channel).toHaveBeenCalledTimes(1)
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", ADDED)
  })

  it("checks a duplicated channel id once", async () => {
    await put({ blacklistedChannelIds: [IGNORED, IGNORED] })
    expect(m.channel).toHaveBeenCalledTimes(1)
  })

  it("never reads the stored settings when the body has no channel ids", async () => {
    await put({ reactionThreshold: 4 })
    await put({ boardChannelId: null })
    expect(m.stored).not.toHaveBeenCalled()
  })

  it("rejects a threshold outside 1 to 100", async () => {
    for (const reactionThreshold of [0, 101, 1.5, "3"]) {
      expect((await put({ reactionThreshold })).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
  })

  it("rejects an empty body", async () => {
    expect((await put({})).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses an ignored channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await put({ blacklistedChannelIds: [IGNORED] })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await put({ reactionThreshold: 2 })).status).toBe(401)
  })
})
