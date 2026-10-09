import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  guild: vi.fn(),
  getCached: vi.fn(),
  setCache: vi.fn(),
  fetchDiscord: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
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
  getGuildChannels: m.fetchDiscord,
}))

import { GET } from "./route"
import { cacheKeys, cacheTTL } from "@/lib/redis-cache"

const GUILD = "1509616350337962024"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const call = (query = "") => GET(new Request(`http://localhost/api${query}`) as never, context as never)
const ITEM = { id: "1", name: "general" }

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.guild.mockResolvedValue({ ok: true, guildId: GUILD })
  m.getCached.mockResolvedValue(null)
  m.setCache.mockResolvedValue(undefined)
})

describe("GET discord/channels", () => {
  it("is 401 signed out, and asks nothing", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("passes the gate's refusal through without calling Discord", async () => {
    m.guild.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "no" }, { status: 409 }) })
    expect((await call()).status).toBe(409)
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("serves a cache hit without calling Discord", async () => {
    m.getCached.mockResolvedValue([ITEM])
    const body = await (await call()).json()
    expect(body.channels).toEqual([ITEM])
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("fetches and caches on a miss", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [ITEM] })
    await call()
    expect(m.fetchDiscord).toHaveBeenCalledWith(GUILD)
    expect(m.setCache).toHaveBeenCalledWith(cacheKeys.discordChannels(GUILD), [ITEM], cacheTTL.discordGuild)
  })

  it("refresh=1 skips a warm cache", async () => {
    m.getCached.mockResolvedValue([{ ...ITEM, name: "Stale" }])
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [{ ...ITEM, name: "Fresh" }] })
    const body = await (await call("?refresh=1")).json()
    expect(body.channels[0].name).toBe("Fresh")
  })

  it("never caches a failure, and reads 404 as the bot being absent", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: false, status: 404 })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("bot_absent")
    expect(m.setCache).not.toHaveBeenCalled()
  })
})
