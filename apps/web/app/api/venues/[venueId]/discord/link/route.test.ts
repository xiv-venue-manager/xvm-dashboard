import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  membership: vi.fn(),
  venue: vi.fn(),
  administers: vi.fn(),
  presence: vi.fn(),
  getVenue: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findFirst: m.membership }, venue: { findUnique: m.venue } },
}))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidate,
  cacheKeys: { venue: (id: string) => `venue:${id}`, venueBySlug: (s: string) => `venue:slug:${s}` },
}))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getVenue: m.getVenue,
  linkVenueExternal: m.link,
  unlinkVenueExternal: m.unlink,
}))
vi.mock("@/lib/discord-user", () => ({ administersGuild: m.administers }))
vi.mock("@/lib/discord-rest", () => ({ getGuildPresence: m.presence }))

import { POST, DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const GUILD = "123456789012345678"
const LINKED_AT = "2026-09-01T12:00:00.000Z"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const remove = () =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context as never)
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never,
    context as never
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.membership.mockResolvedValue({ role: "OWNER" })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1", slug: "lilypad" })
  m.token.mockResolvedValue("tok")
  m.administers.mockResolvedValue({ ok: true, administers: true })
  m.presence.mockResolvedValue({ botIsMember: true, name: "Lilypad Lounge", iconUrl: null })
  m.link.mockResolvedValue({ id: 7, provider: "DiscordGuild", external_id: GUILD })
  m.getVenue.mockResolvedValue({
    external_links: [
      { id: 7, provider: "DiscordGuild", external_id: GUILD, linked_at: LINKED_AT, unlinked_at: null },
    ],
  })
  m.unlink.mockResolvedValue(undefined)
  m.invalidate.mockResolvedValue(undefined)
})

describe("POST /api/venues/[venueId]/discord/link", () => {
  it("is 401 signed out, and asks Discord nothing", async () => {
    m.session.mockResolvedValue(null)
    expect((await post({ guildId: GUILD })).status).toBe(401)
    expect(m.administers).not.toHaveBeenCalled()
    expect(m.link).not.toHaveBeenCalled()
  })

  it("is 403 for a member who is not the owner", async () => {
    m.membership.mockResolvedValue({ role: "MANAGER" })
    expect((await post({ guildId: GUILD })).status).toBe(403)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("is 409 not_connected when the venue has no xvm-api link", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null, slug: "lilypad" })
    const res = await post({ guildId: GUILD })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
    expect(m.link).not.toHaveBeenCalled()
  })

  it("is 503 when the xvm-api credential has lapsed", async () => {
    m.token.mockResolvedValue(null)
    expect((await post({ guildId: GUILD })).status).toBe(503)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("rejects anything that is not a snowflake before asking Discord", async () => {
    expect((await post({ guildId: "not-an-id" })).status).toBe(400)
    expect((await post({ guildId: "42" })).status).toBe(400)
    expect(m.administers).not.toHaveBeenCalled()
  })

  it("is 412 when the caller's Discord grant predates the guilds scope", async () => {
    m.administers.mockResolvedValue({ ok: false, failure: "reauth_required" })
    expect((await post({ guildId: GUILD })).status).toBe(412)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("is 502 when Discord cannot be reached, not a silent refusal", async () => {
    m.administers.mockResolvedValue({ ok: false, failure: "discord_unavailable" })
    expect((await post({ guildId: GUILD })).status).toBe(502)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("refuses a guild the caller does not administer, and writes nothing", async () => {
    m.administers.mockResolvedValue({ ok: true, administers: false })
    expect((await post({ guildId: GUILD })).status).toBe(403)
    expect(m.presence).not.toHaveBeenCalled()
    expect(m.link).not.toHaveBeenCalled()
  })

  it("checks authority before the bot's presence", async () => {
    m.administers.mockResolvedValue({ ok: true, administers: false })
    await post({ guildId: GUILD })
    expect(m.administers).toHaveBeenCalledWith("user-1", GUILD)
    expect(m.presence).not.toHaveBeenCalled()
  })

  it("is 409 bot_absent when the bot is not in that guild, and writes nothing", async () => {
    m.presence.mockResolvedValue({ botIsMember: false, name: null, iconUrl: null })
    const res = await post({ guildId: GUILD })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("bot_absent")
    expect(m.link).not.toHaveBeenCalled()
  })

  it("links the guild and drops the venue's cached copies", async () => {
    const res = await post({ guildId: GUILD })
    expect(res.status).toBe(201)
    expect(m.link).toHaveBeenCalledWith("tok", "xv-1", { provider: "DiscordGuild", external_id: GUILD })
    expect(m.invalidate).toHaveBeenCalledWith("venue:vn_1")
    expect(m.invalidate).toHaveBeenCalledWith("venue:slug:lilypad")
  })

  it("forwards xvm-api's conflict for a guild another venue already holds", async () => {
    m.link.mockRejectedValue(
      new XvmApiError(409, JSON.stringify({ detail: "The identity belongs to another venue." }))
    )
    const res = await post({ guildId: GUILD })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("The identity belongs to another venue.")
  })
})

describe("DELETE /api/venues/[venueId]/discord/link", () => {
  it("is 401 signed out, and reads nothing", async () => {
    m.session.mockResolvedValue(null)
    expect((await remove()).status).toBe(401)
    expect(m.getVenue).not.toHaveBeenCalled()
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("is 403 for a member who is not the owner", async () => {
    m.membership.mockResolvedValue({ role: "MANAGER" })
    expect((await remove()).status).toBe(403)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("is 409 not_connected when the venue has no xvm-api link", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null, slug: "lilypad" })
    const res = await remove()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("is 503 when the xvm-api credential has lapsed", async () => {
    m.token.mockResolvedValue(null)
    expect((await remove()).status).toBe(503)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("is 404 when no Discord server is connected", async () => {
    m.getVenue.mockResolvedValue({ external_links: [] })
    expect((await remove()).status).toBe(404)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("never unlinks a tombstoned row or another provider's link", async () => {
    m.getVenue.mockResolvedValue({
      external_links: [
        { id: 3, provider: "DiscordGuild", external_id: "999", linked_at: LINKED_AT, unlinked_at: LINKED_AT },
        { id: 4, provider: "FFXIVVenues", external_id: "abc", linked_at: LINKED_AT, unlinked_at: null },
      ],
    })
    expect((await remove()).status).toBe(404)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("unlinks the live link by the id xvm-api gave it, and drops the cached copies", async () => {
    const res = await remove()
    expect(res.status).toBe(204)
    expect(m.unlink).toHaveBeenCalledWith("tok", "xv-1", 7)
    expect(m.invalidate).toHaveBeenCalledWith("venue:vn_1")
    expect(m.invalidate).toHaveBeenCalledWith("venue:slug:lilypad")
  })

  it("does not require authority over the guild it is unlinking", async () => {
    // Deliberately asymmetric with POST. An owner who left the server or lost Manage Server is
    // exactly who needs to undo a wrong link; demanding authority here would strand the venue.
    m.administers.mockResolvedValue({ ok: true, administers: false })
    expect((await remove()).status).toBe(204)
    expect(m.administers).not.toHaveBeenCalled()
  })

  it("forwards xvm-api's refusal rather than inventing one", async () => {
    m.unlink.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Owner tier required." })))
    const res = await remove()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("Owner tier required.")
    expect(m.invalidate).not.toHaveBeenCalled()
  })
})
