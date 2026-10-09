import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  role: vi.fn(),
  venue: vi.fn(),
  token: vi.fn(),
  getVenue: vi.fn(),
  cached: vi.fn(),
  setCache: vi.fn(),
  channels: vi.fn(),
}))

vi.mock("@/lib/api/venue-access", () => ({ requireVenueRole: m.role }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getVenue: m.getVenue,
}))

vi.mock("@/lib/redis-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/redis-cache")>()),
  getCached: m.cached,
  setCache: m.setCache,
}))
vi.mock("@/lib/discord-rest", () => ({ getGuildChannels: m.channels }))

import { requireVenueGuild, requireChannelInGuild, discordFailureResponse, wantsRefresh } from "./venue-guild"
import { XvmApiError } from "@/lib/api/xvm-api"

const GUILD = "1509616350337962024"
const CHANNEL = "1509616350337962099"
const OTHER_GUILD_CHANNEL = "1409616350337962011"
const links = (rows: Record<string, unknown>[]) => ({ external_links: rows })
const liveLink = (over: Record<string, unknown> = {}) => ({
  id: 7,
  provider: "DiscordGuild",
  external_id: GUILD,
  linked_at: "2026-09-01T00:00:00.000Z",
  unlinked_at: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.role.mockResolvedValue({ ok: true, role: "STAFF" })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.token.mockResolvedValue("tok")
  m.getVenue.mockResolvedValue(links([liveLink()]))
  m.cached.mockResolvedValue(null)
  m.channels.mockResolvedValue({ ok: true, data: [{ id: CHANNEL, name: "shifts" }] })
})

describe("requireVenueGuild", () => {
  it("returns the linked guild for a member", async () => {
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result).toEqual({ ok: true, guildId: GUILD })
  })

  it("asks for STAFF, so a staff member can read a picker's options", async () => {
    // The minimum is the whole authorization decision here and it is not visible in the
    // response, so it is asserted directly rather than inferred from a refusal.
    await requireVenueGuild("user-1", "vn_1")
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", "STAFF", expect.any(String))
  })

  it("passes the gate's own refusal straight through, without asking xvm-api anything", async () => {
    const response = NextResponse.json({ error: "nope" }, { status: 403 })
    m.role.mockResolvedValue({ ok: false, response })
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result).toEqual({ ok: false, response })
    expect(m.getVenue).not.toHaveBeenCalled()
  })

  it("is 409 not_connected when the venue has no xvm-api venue", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null })
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(409)
    expect((await result.response.json()).error).toBe("not_connected")
  })

  it("is 503 when the xvm-api credential has lapsed", async () => {
    m.token.mockResolvedValue(null)
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(503)
  })

  it("is 409 not_linked when no Discord server is connected", async () => {
    m.getVenue.mockResolvedValue(links([]))
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(409)
    expect((await result.response.json()).error).toBe("not_linked")
  })

  it("ignores a tombstoned link and another provider's link", async () => {
    m.getVenue.mockResolvedValue(
      links([
        liveLink({ external_id: "999", unlinked_at: "2026-10-01T00:00:00Z" }),
        { provider: "FFXIVVenues", external_id: "abc", unlinked_at: null },
      ])
    )
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect((await result.response.json()).error).toBe("not_linked")
  })

  it("forwards an xvm-api failure rather than reporting no link", async () => {
    // "we could not ask" must not look like "nothing is connected", or the UI tells someone to
    // connect a server they already connected.
    m.getVenue.mockRejectedValue(new XvmApiError(500, "boom"))
    const result = await requireVenueGuild("user-1", "vn_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).not.toBe(409)
  })
})

describe("discordFailureResponse", () => {
  it("reads a 404 as the bot being absent, which a person can act on", async () => {
    const response = discordFailureResponse(404)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe("bot_absent")
  })

  it("reads anything else as transient", async () => {
    for (const status of [401, 403, 429, 500, undefined]) {
      expect(discordFailureResponse(status).status).toBe(502)
    }
  })
})

describe("wantsRefresh", () => {
  it("is on only for refresh=1", () => {
    expect(wantsRefresh(new Request("http://x/api?refresh=1"))).toBe(true)
    expect(wantsRefresh(new Request("http://x/api?refresh=0"))).toBe(false)
    expect(wantsRefresh(new Request("http://x/api?refresh=true"))).toBe(false)
    expect(wantsRefresh(new Request("http://x/api"))).toBe(false)
  })
})

describe("requireChannelInGuild", () => {
  const check = (channelId = CHANNEL) => requireChannelInGuild("user-1", "vn_1", channelId)

  it("accepts a channel in the cached list without asking Discord", async () => {
    m.cached.mockResolvedValue([{ id: CHANNEL, name: "shifts" }])
    expect(await check()).toEqual({ ok: true })
    expect(m.channels).not.toHaveBeenCalled()
  })

  it("asks Discord on a cache miss, and caches what it learns", async () => {
    expect(await check()).toEqual({ ok: true })
    expect(m.channels).toHaveBeenCalledWith(GUILD)
    expect(m.setCache).toHaveBeenCalledWith(`discord:${GUILD}:channels`, [{ id: CHANNEL, name: "shifts" }], expect.any(Number))
  })

  it("re-asks Discord when the cached list lacks the channel, so a channel made minutes ago is not refused", async () => {
    // The list is cached for five minutes. A rejection from stale data would tell somebody a real
    // channel is not in their server, so only a live answer may refuse.
    m.cached.mockResolvedValue([{ id: "1", name: "old" }])
    expect(await check()).toEqual({ ok: true })
    expect(m.channels).toHaveBeenCalledTimes(1)
  })

  it("refuses a channel that is not in this venue's server, on the live list", async () => {
    const result = await check(OTHER_GUILD_CHANNEL)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(await result.response.json()).toMatchObject({ error: "channel_not_in_guild" })
  })

  it("refuses when the server cannot be established, rather than letting any id through", async () => {
    // Fail closed: with the id unchecked, the bot could be pointed at a channel in any server it has
    // joined.
    m.getVenue.mockResolvedValue(links([]))
    const result = await check()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(409)
    expect(await result.response.json()).toMatchObject({ error: "not_linked" })
    expect(m.channels).not.toHaveBeenCalled()
  })

  it("reports the bot being absent as something a person can fix", async () => {
    m.channels.mockResolvedValue({ ok: false, status: 404 })
    const result = await check()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(409)
    expect(await result.response.json()).toMatchObject({ error: "bot_absent" })
  })

  it("reports Discord being down as transient, not as the channel being wrong", async () => {
    m.channels.mockResolvedValue({ ok: false, status: 500 })
    const result = await check()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(502)
  })
})
