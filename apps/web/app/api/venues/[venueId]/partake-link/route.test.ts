import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  requireRole: vi.fn(),
  getVenue: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue, requireMyVenueRole: m.requireRole }))
vi.mock("@/lib/api/xvm-api", () => ({ getVenue: m.getVenue, linkVenueExternal: m.link, unlinkVenueExternal: m.unlink }))

import { GET, PUT } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new NextRequest("http://localhost/api"), ctx)
const put = (body: unknown) =>
  (PUT as unknown as Handler)(new NextRequest("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }), ctx)

const partake = (externalId: string) => ({ id: 7, provider: "Partake", external_id: externalId, unlinked_at: null })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.requireRole.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.getVenue.mockResolvedValue({ external_links: [] })
})

describe("partake link", () => {
  it("reads the live Partake team id, ignoring other providers and unlinked rows", async () => {
    m.getVenue.mockResolvedValue({
      external_links: [
        { id: 1, provider: "DiscordGuild", external_id: "123", unlinked_at: null },
        { ...partake("99"), unlinked_at: "2026-01-01" },
        partake("1359"),
      ],
    })
    expect(await (await get()).json()).toEqual({ teamId: 1359 })
  })

  it("reads null when no team is linked", async () => {
    expect(await (await get()).json()).toEqual({ teamId: null })
  })

  it("links a team when none is linked", async () => {
    expect((await put({ teamId: 1359 })).status).toBe(200)
    expect(m.requireRole).toHaveBeenCalledWith("u1", "gilded-lily", "OWNER", expect.any(String), expect.any(String))
    expect(m.unlink).not.toHaveBeenCalled()
    expect(m.link).toHaveBeenCalledWith("tok", "ven_1", { provider: "Partake", external_id: "1359" })
  })

  it("replaces a different team by unlinking first", async () => {
    m.getVenue.mockResolvedValue({ external_links: [partake("5")] })
    await put({ teamId: 1359 })
    expect(m.unlink).toHaveBeenCalledWith("tok", "ven_1", 7)
    expect(m.link).toHaveBeenCalledWith("tok", "ven_1", { provider: "Partake", external_id: "1359" })
  })

  it("does nothing when the team is already linked", async () => {
    m.getVenue.mockResolvedValue({ external_links: [partake("1359")] })
    expect((await put({ teamId: 1359 })).status).toBe(200)
    expect(m.unlink).not.toHaveBeenCalled()
    expect(m.link).not.toHaveBeenCalled()
  })

  it("unlinks on null", async () => {
    m.getVenue.mockResolvedValue({ external_links: [partake("1359")] })
    expect(await (await put({ teamId: null })).json()).toEqual({ teamId: null })
    expect(m.unlink).toHaveBeenCalledWith("tok", "ven_1", 7)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("rejects a non-integer or non-positive team id before touching xvm-api", async () => {
    expect((await put({ teamId: 1.5 })).status).toBe(400)
    expect((await put({ teamId: 0 })).status).toBe(400)
    expect(m.getVenue).not.toHaveBeenCalled()
  })

  it("refuses non-owners", async () => {
    m.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    expect((await put({ teamId: 1 })).status).toBe(403)
    expect(m.link).not.toHaveBeenCalled()
  })
})
