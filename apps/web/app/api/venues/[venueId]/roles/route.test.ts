import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  role: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listPositions: m.list,
  createPosition: m.create,
}))
vi.mock("@/lib/api/venue-guild", () => ({ requireRoleInGuild: m.role }))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.create.mockResolvedValue({ id: 5, name: "Bartender", color: null, responsibilities: null, hourly_rate_minor: null, pot_payout_mode: "STANDARD", contractor_shares_pot: false, discord_role_id: "1509616350337962101", member_ids: [] })
})

import { GET, POST } from "./route"

const context = { params: Promise.resolve({ venueId: "my-venue" }) }

describe("GET /api/venues/[venueId]/roles", () => {
  it("lists the positions of the xvm-api venue the ref resolves to", async () => {
    m.list.mockResolvedValue([])
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(res.status).toBe(200)
    expect(m.lookup).toHaveBeenCalledWith("user-1", "my-venue", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1")
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await GET(new Request("http://localhost/api") as never, context as never)).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })
})

describe("POST /api/venues/[venueId]/roles", () => {
  const post = (body: unknown) =>
    POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

  it("checks the Discord role against the venue's server, then sends it on", async () => {
    const res = await post({ name: "Bartender", discordRoleId: "1509616350337962101" })
    expect(res.status).toBe(201)
    expect(m.role).toHaveBeenCalledWith("user-1", "my-venue", "1509616350337962101")
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", expect.objectContaining({ discord_role_id: "1509616350337962101" }))
    expect((await res.json()).discordRoleId).toBe("1509616350337962101")
  })

  it("does not create the position when the role is refused", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_unsafe" }, { status: 400 }) })
    expect((await post({ name: "Bartender", discordRoleId: "1509616350337962102" })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("skips the check, and sends no role, when none is picked", async () => {
    expect((await post({ name: "Bartender", discordRoleId: null })).status).toBe(201)
    expect(m.role).not.toHaveBeenCalled()
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", expect.objectContaining({ discord_role_id: null }))
  })

  it("rejects an id past what xvm-api stores", async () => {
    expect((await post({ name: "Bartender", discordRoleId: "9223372036854775808" })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
