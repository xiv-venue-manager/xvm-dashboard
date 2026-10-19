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
  getGuildRoles: m.fetchDiscord,
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
})

const role = (over: Record<string, unknown> = {}) => ({
  id: "100",
  name: "Bartender",
  color: 123,
  permissions: "0",
  managed: false,
  ...over,
})

describe("GET discord/roles", () => {
  it("is 401 signed out, and asks nothing", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.guild).not.toHaveBeenCalled()
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("passes the gate's refusal through without calling Discord", async () => {
    m.guild.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "no" }, { status: 403 }) })
    expect((await call()).status).toBe(403)
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("serves a cache hit without calling Discord", async () => {
    m.getCached.mockResolvedValue([role()])
    const body = await (await call()).json()
    expect(body.roles).toHaveLength(1)
    expect(m.fetchDiscord).not.toHaveBeenCalled()
  })

  it("fetches and caches on a miss, under the guild's key", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [role()] })
    await call()
    expect(m.fetchDiscord).toHaveBeenCalledWith(GUILD)
    expect(m.setCache).toHaveBeenCalledWith(cacheKeys.discordRoles(GUILD), [role()], cacheTTL.discordGuild)
  })

  it("refresh=1 skips a warm cache", async () => {
    m.getCached.mockResolvedValue([role({ name: "Stale" })])
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [role({ name: "Fresh" })] })
    const body = await (await call("?refresh=1")).json()
    expect(body.roles[0].name).toBe("Fresh")
    expect(m.fetchDiscord).toHaveBeenCalled()
  })

  it("never caches a failure", async () => {
    // A five-minute memory of a transient Discord failure is worse than the failure.
    m.fetchDiscord.mockResolvedValue({ ok: false, status: 500 })
    expect((await call()).status).toBe(502)
    expect(m.setCache).not.toHaveBeenCalled()
  })

  it("reads a 404 as the bot being absent", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: false, status: 404 })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("bot_absent")
  })

  it("annotates rather than filters, so the picker can keep its own saved value", async () => {
    m.fetchDiscord.mockResolvedValue({
      ok: true,
      data: [
        role({ id: "100", name: "Bartender" }),
        role({ id: "200", name: "Admin", permissions: "8" }),
        role({ id: "300", name: "Bot role", managed: true }),
        role({ id: GUILD, name: "@everyone" }),
      ],
    })
    const body = await (await call()).json()
    expect(body.roles.map((r: { name: string; unsafeReason: string | null }) => [r.name, r.unsafeReason])).toEqual([
      ["Bartender", null],
      ["Admin", "it has Administrator permission"],
      ["Bot role", "it's managed by a bot or integration"],
      ["@everyone", "it's the @everyone role"],
    ])
  })

  it("does not hand the browser the raw permissions bitfield", async () => {
    m.fetchDiscord.mockResolvedValue({ ok: true, data: [role({ permissions: "8" })] })
    const body = await (await call()).json()
    expect(body.roles[0]).not.toHaveProperty("permissions")
    expect(body.roles[0]).not.toHaveProperty("managed")
  })
})
