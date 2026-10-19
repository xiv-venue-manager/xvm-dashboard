import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  role: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/venue-guild", () => ({ requireRoleInGuild: m.role }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listPositions: m.list,
  updatePosition: m.update,
}))

const HELD = "1509616350337962101"
const OTHER = "1509616350337962102"
const position = (discord_role_id: string | null) => ({
  id: 5,
  name: "Bartender",
  color: null,
  responsibilities: null,
  hourly_rate_minor: null,
  pot_payout_mode: "STANDARD",
  contractor_shares_pot: false,
  discord_role_id,
  member_ids: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.list.mockResolvedValue([position(HELD)])
  m.update.mockImplementation(async (_t, _v, _id, body) => position(body.discord_role_id ?? null))
})

import { PUT } from "./route"

const context = { params: Promise.resolve({ venueId: "my-venue", roleId: "5" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/roles/[roleId]", () => {
  it("passes the role the position already holds, so re-saving an unsafe one is not refused", async () => {
    expect((await put({ name: "Bartender", discordRoleId: HELD })).status).toBe(200)
    expect(m.role).toHaveBeenCalledWith("user-1", "my-venue", HELD, HELD)
  })

  it("checks a newly picked role against the server and sends it on", async () => {
    const res = await put({ discordRoleId: OTHER })
    expect(m.role).toHaveBeenCalledWith("user-1", "my-venue", OTHER, HELD)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, expect.objectContaining({ discord_role_id: OTHER }))
    expect((await res.json()).discordRoleId).toBe(OTHER)
  })

  it("does not update the position when the role is refused", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_unsafe" }, { status: 400 }) })
    expect((await put({ discordRoleId: OTHER })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("clears the role with null, without asking Discord or xvm-api about it", async () => {
    expect((await put({ discordRoleId: null })).status).toBe(200)
    expect(m.role).not.toHaveBeenCalled()
    expect(m.list).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, expect.objectContaining({ discord_role_id: null }))
  })

  it("leaves the role alone when the body does not mention it", async () => {
    await put({ name: "Barkeep" })
    expect(m.update.mock.calls[0][3].discord_role_id).toBeUndefined()
  })

  it("is 404 for a position that is not in the venue, before any Discord call", async () => {
    m.list.mockResolvedValue([])
    expect((await put({ discordRoleId: OTHER })).status).toBe(404)
    expect(m.role).not.toHaveBeenCalled()
  })
})
