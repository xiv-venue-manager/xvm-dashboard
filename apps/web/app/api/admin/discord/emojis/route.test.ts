import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockMe, mockToken, mockFetch, mockGetCached, mockSetCache } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockMe: vi.fn(),
  mockToken: vi.fn(),
  mockFetch: vi.fn(),
  mockGetCached: vi.fn(),
  mockSetCache: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api", () => ({ getMe: mockMe }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: () => new Response(null, { status: 503 }),
}))
vi.mock("@/lib/redis-cache", () => ({
  getCached: mockGetCached,
  setCache: mockSetCache,
  cacheKeys: { discordAppEmojis: () => "discord:app:emojis" },
  cacheTTL: { discordGuild: 300 },
}))
vi.mock("@/lib/discord-rest", () => ({ getApplicationEmojis: mockFetch }))

import { GET } from "./route"

const get = (query = "") =>
  (GET as unknown as (req: Request) => Promise<Response>)(new Request(`http://localhost/api/admin/discord/emojis${query}`))

const emojis = [{ id: "1", name: "frog", animated: false }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockMe.mockResolvedValue({ scopes: ["platform_admin"] })
  mockToken.mockResolvedValue("tok")
  mockGetCached.mockResolvedValue(null)
  mockSetCache.mockResolvedValue(undefined)
  mockFetch.mockResolvedValue({ ok: true, data: emojis })
})

describe("GET admin/discord/emojis", () => {
  it("returns the application's emoji and caches them", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ emojis })
    expect(mockSetCache).toHaveBeenCalledWith("discord:app:emojis", emojis, 300)
  })

  it("serves a cached list without calling Discord", async () => {
    mockGetCached.mockResolvedValue(emojis)
    expect((await get()).status).toBe(200)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("skips the cache for ?refresh=1", async () => {
    mockGetCached.mockResolvedValue(emojis)
    expect((await get("?refresh=1")).status).toBe(200)
    expect(mockFetch).toHaveBeenCalled()
  })

  it("rejects an unauthenticated caller before looking anything up", async () => {
    mockSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(mockMe).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before calling Discord, naming itself as the refuser", async () => {
    mockMe.mockResolvedValue({ scopes: [] })
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("not_admin")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("answers 503 without an xvm-api credential, since the admin scope is read from it", async () => {
    mockToken.mockResolvedValue(null)
    expect((await get()).status).toBe(503)
    expect(mockMe).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("answers 502 when Discord cannot be reached, and caches nothing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    expect((await get()).status).toBe(502)
    expect(mockSetCache).not.toHaveBeenCalled()
  })

  it("answers 502 rather than the venue route's bot_absent on a 404", async () => {
    // discordFailureResponse maps 404 to 409 "the bot isn't in this venue's server", which is
    // meaningless here - there is no venue.
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    const res = await get()
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/bot_absent/)
  })
})
