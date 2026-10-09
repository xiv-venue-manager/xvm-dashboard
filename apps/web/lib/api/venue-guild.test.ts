import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  role: vi.fn(),
  venue: vi.fn(),
  token: vi.fn(),
  getVenue: vi.fn(),
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

import { requireVenueGuild, discordFailureResponse, wantsRefresh } from "./venue-guild"
import { XvmApiError } from "@/lib/api/xvm-api"

const GUILD = "1509616350337962024"
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
