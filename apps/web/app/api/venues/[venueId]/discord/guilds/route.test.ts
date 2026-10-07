import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  membership: vi.fn(),
  venue: vi.fn(),
  getVenue: vi.fn(),
  manageable: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findFirst: m.membership }, venue: { findUnique: m.venue } },
}))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getVenue: m.getVenue,
}))
vi.mock("@/lib/discord-user", () => ({ listManageableGuilds: m.manageable }))

import { GET } from "./route"

const GUILD = "123456789012345678"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const get = () => GET(new Request("http://localhost/api") as never, context as never)

const links = (over: Record<string, unknown>[] = []) => ({ external_links: over })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.membership.mockResolvedValue({ role: "OWNER" })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.token.mockResolvedValue("tok")
  m.getVenue.mockResolvedValue(links())
  m.manageable.mockResolvedValue({ ok: true, guilds: [{ id: GUILD, name: "Lilypad", iconUrl: null }] })
})

describe("GET /api/venues/[venueId]/discord/guilds", () => {
  it("is 401 signed out and 403 for a non-owner, without asking Discord", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    m.session.mockResolvedValue({ user: { id: "user-1" } })
    m.membership.mockResolvedValue({ role: "STAFF" })
    expect((await get()).status).toBe(403)
    expect(m.manageable).not.toHaveBeenCalled()
  })

  it("is 409 not_connected when the venue has no xvm-api link", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null })
    const res = await get()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
  })

  it("is 503 when the xvm-api credential has lapsed", async () => {
    m.token.mockResolvedValue(null)
    expect((await get()).status).toBe(503)
  })

  it("reports the guild already linked to this venue", async () => {
    m.getVenue.mockResolvedValue(
      links([{ provider: "DiscordGuild", external_id: GUILD, unlinked_at: null }])
    )
    const body = await (await get()).json()
    expect(body.currentGuildId).toBe(GUILD)
  })

  it("ignores an unlinked row and links for other providers", async () => {
    m.getVenue.mockResolvedValue(
      links([
        { provider: "DiscordGuild", external_id: "999", unlinked_at: "2026-10-01T00:00:00Z" },
        { provider: "FFXIVVenues", external_id: "abc", unlinked_at: null },
      ])
    )
    const body = await (await get()).json()
    expect(body.currentGuildId).toBeNull()
  })

  it("returns the guilds the caller manages", async () => {
    const body = await (await get()).json()
    expect(body.guilds).toEqual([{ id: GUILD, name: "Lilypad", iconUrl: null }])
    expect(body.needsReauth).toBe(false)
  })

  it("asks for re-consent as a state, not an error, and still reports the current link", async () => {
    m.getVenue.mockResolvedValue(
      links([{ provider: "DiscordGuild", external_id: GUILD, unlinked_at: null }])
    )
    m.manageable.mockResolvedValue({ ok: false, failure: "reauth_required" })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.needsReauth).toBe(true)
    expect(body.guilds).toEqual([])
    expect(body.currentGuildId).toBe(GUILD)
  })

  it("is 502 when Discord is unreachable, so it cannot read as 'you manage no servers'", async () => {
    m.manageable.mockResolvedValue({ ok: false, failure: "discord_unavailable" })
    expect((await get()).status).toBe(502)
  })
})
