import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  venue: vi.fn(),
  isOwner: vi.fn(),
  getVenue: vi.fn(),
  memberships: vi.fn(),
  manageable: vi.fn(),
  grant: vi.fn(),
  presence: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return {
    ...actual,
    getValidXvmApiToken: m.token,
    isVenueOwner: m.isOwner,
    invalidateXvmApiCredential: vi.fn(),
  }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getVenue: m.getVenue,
  listMemberships: m.memberships,
}))
vi.mock("@/lib/discord-user", () => ({ listManageableGuilds: m.manageable, discordGrantFrom: m.grant }))
vi.mock("@/lib/discord-rest", () => ({ getGuildPresence: m.presence }))

import { GET } from "./route"

const GUILD = "123456789012345678"
const LINKED_AT = "2026-09-01T12:00:00.000Z"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const get = () => GET(new Request("http://localhost/api") as never, context as never)

const links = (over: Record<string, unknown>[] = []) => ({ external_links: over })
const discordLink = (over: Record<string, unknown> = {}) => ({
  id: 7,
  provider: "DiscordGuild",
  external_id: GUILD,
  linked_at: LINKED_AT,
  linked_by_person_id: 42,
  unlinked_at: null,
  ...over,
})

const GRANT = { accessToken: "t", expiresAt: 9999999999, scope: "identify guilds" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.isOwner.mockResolvedValue(true)
  m.token.mockResolvedValue("tok")
  m.getVenue.mockResolvedValue(links())
  m.memberships.mockResolvedValue([{ person: { id: 42, display_name: "Allegro Vivo" } }])
  m.grant.mockResolvedValue(GRANT)
  m.manageable.mockResolvedValue({ ok: true, guilds: [{ id: GUILD, name: "Lilypad", iconUrl: null }] })
  m.presence.mockResolvedValue({ botIsMember: true, name: "Lilypad Lounge", iconUrl: "https://cdn/i.png" })
})

describe("GET /api/venues/[venueId]/discord/guilds", () => {
  it("lists guilds using the Discord grant carried on the session token", async () => {
    await get()
    expect(m.manageable).toHaveBeenCalledWith(GRANT)
  })

  it("is 401 signed out and 403 for a non-owner, without asking Discord", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    m.session.mockResolvedValue({ user: { id: "user-1" } })
    m.isOwner.mockResolvedValue(false)
    expect((await get()).status).toBe(403)
    expect(m.manageable).not.toHaveBeenCalled()
    expect(m.getVenue).not.toHaveBeenCalled()
  })

  it("asks xvm-api who the owner is, not Prisma", async () => {
    // Memberships live in xvm-api: the invite flow writes them there and never mirrors them
    // into Prisma, so an owner promoted through the staff UI has no Prisma row to find.
    await get()
    expect(m.isOwner).toHaveBeenCalledWith("user-1", "tok", "xv-1")
  })

  it("is 503, not 403, when the membership read itself fails", async () => {
    // A refusal has to mean "not the owner". An unreachable xvm-api must not read as one.
    m.isOwner.mockRejectedValue(new Error("boom"))
    expect((await get()).status).toBe(503)
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

  it("reports the live link, including the id an unlink needs", async () => {
    m.getVenue.mockResolvedValue(links([discordLink()]))
    const body = await (await get()).json()
    expect(body.current).toEqual({
      linkId: 7,
      guildId: GUILD,
      linkedAt: LINKED_AT,
      linkedBy: "Allegro Vivo",
      name: "Lilypad Lounge",
      iconUrl: "https://cdn/i.png",
    })
  })

  it("ignores an unlinked row and links for other providers, and asks the bot nothing", async () => {
    m.getVenue.mockResolvedValue(
      links([
        discordLink({ external_id: "999", unlinked_at: "2026-10-01T00:00:00Z" }),
        { provider: "FFXIVVenues", external_id: "abc", linked_at: LINKED_AT, unlinked_at: null },
      ])
    )
    const body = await (await get()).json()
    expect(body.current).toBeNull()
    expect(m.presence).not.toHaveBeenCalled()
  })

  it("returns the guilds the caller manages", async () => {
    const body = await (await get()).json()
    expect(body.guilds).toEqual([{ id: GUILD, name: "Lilypad", iconUrl: null }])
    expect(body.needsReauth).toBe(false)
  })

  it("names the linked guild from the bot, not from the caller's own list", async () => {
    // The case that matters: a link pointing somewhere the caller no longer manages. Resolving the
    // name from `guilds` would render a bare snowflake here, which is precisely when someone needs
    // to recognise what they are about to unlink.
    m.getVenue.mockResolvedValue(links([discordLink({ external_id: "987654321098765432" })]))
    m.presence.mockResolvedValue({ botIsMember: true, name: "Somewhere Else", iconUrl: null })
    const body = await (await get()).json()
    expect(m.presence).toHaveBeenCalledWith("987654321098765432")
    expect(body.current.name).toBe("Somewhere Else")
    expect(body.guilds.some((g: { id: string }) => g.id === "987654321098765432")).toBe(false)
  })

  it("still reports the link when the bot cannot be asked", async () => {
    m.getVenue.mockResolvedValue(links([discordLink()]))
    m.presence.mockResolvedValue({ botIsMember: true, name: null, iconUrl: null })
    const body = await (await get()).json()
    expect(body.current.guildId).toBe(GUILD)
    expect(body.current.name).toBeNull()
  })

  it("has no byline for a link no actor was recorded for, and does not go looking", async () => {
    // The seed scripts wrote links with no actor, so this is the shape of every link that predates
    // the picker.
    m.getVenue.mockResolvedValue(links([discordLink({ linked_by_person_id: null })]))
    const body = await (await get()).json()
    expect(body.current.linkedBy).toBeNull()
    expect(m.memberships).not.toHaveBeenCalled()
  })

  it("has no byline when the linker is not in the venue's membership list", async () => {
    m.getVenue.mockResolvedValue(links([discordLink({ linked_by_person_id: 99 })]))
    const body = await (await get()).json()
    expect(body.current.linkedBy).toBeNull()
  })

  it("keeps the link when the membership read fails, since a byline is cosmetic", async () => {
    m.getVenue.mockResolvedValue(links([discordLink()]))
    m.memberships.mockRejectedValue(new Error("boom"))
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.current.guildId).toBe(GUILD)
    expect(body.current.linkedBy).toBeNull()
  })

  it("asks for re-consent as a state, not an error, and still reports the current link", async () => {
    m.getVenue.mockResolvedValue(links([discordLink()]))
    m.manageable.mockResolvedValue({ ok: false, failure: "reauth_required" })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.needsReauth).toBe(true)
    expect(body.guilds).toEqual([])
    expect(body.current.guildId).toBe(GUILD)
  })

  it("is 502 when Discord is unreachable, so it cannot read as 'you manage no servers'", async () => {
    m.manageable.mockResolvedValue({ ok: false, failure: "discord_unavailable" })
    expect((await get()).status).toBe(502)
  })
})
