import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  guild: vi.fn(),
  getCached: vi.fn(),
  setCache: vi.fn(),
  fetchDiscord: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
// Partial: discordFailureResponse and wantsRefresh are the behaviour under test, not stubs.
vi.mock("@/lib/api/venue-guild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-guild")>()),
  requireVenueGuild: m.guild,
}))
vi.mock("@/lib/redis-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/redis-cache")>()),
  getCached: m.getCached,
  setCache: m.setCache,
}))
vi.mock("@/lib/discord-rest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord-rest")>()),
  searchGuildMembers: m.fetchDiscord,
  getGuildMembers: m.resolve,
}))

import { GET } from "./route"
import { cacheKeys, cacheTTL } from "@/lib/redis-cache"

const GUILD = "1509616350337962024"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const call = (query = "") =>
  GET(new Request(`http://localhost/api${query}`) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.guild.mockResolvedValue({ ok: true, guildId: GUILD })
  m.getCached.mockResolvedValue(null)
  m.setCache.mockResolvedValue(undefined)
  m.resolve.mockResolvedValue(new Map())
})

const member = (id: string, displayName: string) => ({
  id,
  username: displayName.toLowerCase(),
  displayName,
  avatarUrl: null,
})

describe("GET discord/members", () => {
  it("is 400 with neither q nor ids, before touching the gate", async () => {
    expect((await call()).status).toBe(400)
    expect(m.guild).not.toHaveBeenCalled()
  })

  it("searches without caching, because the key space is anything anyone types", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [member("1", "Allegro")] })
    const body = await (await call("?q=alle")).json()
    expect(m.fetchDiscord).toHaveBeenCalledWith(GUILD, "alle")
    expect(body.members).toHaveLength(1)
    expect(m.getCached).not.toHaveBeenCalled()
    expect(m.setCache).not.toHaveBeenCalled()
  })

  it("maps a search failure the same way as the other routes", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: false, status: 404 })
    const res = await call("?q=alle")
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("bot_absent")
  })

  it("resolves ids, fetching only the ones not already cached", async () => {
    m.getCached.mockImplementation(async (key: string) =>
      key === cacheKeys.discordMember(GUILD, "1") ? member("1", "Cached") : null
    )
    m.resolve.mockResolvedValue(new Map([["2", member("2", "Fetched")]]))
    const body = await (await call("?ids=1,2")).json()
    expect(m.resolve).toHaveBeenCalledWith(GUILD, ["2"])
    expect(body.members["1"].displayName).toBe("Cached")
    expect(body.members["2"].displayName).toBe("Fetched")
    expect(m.setCache).toHaveBeenCalledWith(
      cacheKeys.discordMember(GUILD, "2"),
      member("2", "Fetched"),
      cacheTTL.discordMember
    )
  })

  it("omits an id Discord would not return, so the caller can fall back to the raw id", async () => {
    m.resolve.mockResolvedValue(new Map())
    const body = await (await call("?ids=999")).json()
    expect(body.members).toEqual({})
  })

  it("dedupes ids and caps the fan-out", async () => {
    const many = Array.from({ length: 60 }, (_, i) => String(i)).join(",")
    await call(`?ids=1,1,1`)
    expect(m.resolve).toHaveBeenCalledWith(GUILD, ["1"])
    m.resolve.mockClear()
    await call(`?ids=${many}`)
    expect(m.resolve.mock.calls[0][1]).toHaveLength(50)
  })

  it("drops an id that is not a snowflake instead of putting it in a Discord path", async () => {
    const body = await (await call(`?ids=${encodeURIComponent("../../9/members/1")},%2e%2e,12345678901234567890123,7`)).json()
    expect(m.getCached).toHaveBeenCalledTimes(1)
    expect(m.resolve).toHaveBeenCalledWith(GUILD, ["7"])
    expect(body.members).toEqual({})
  })
})
