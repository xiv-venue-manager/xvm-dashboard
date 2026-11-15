import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  guild: vi.fn(),
  role: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireRoleInGuild: m.role }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  createLevelingTier: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.create.mockResolvedValue({ id: 1 })
})

import { POST } from "./route"

const ROLE = "1509616350337962099"
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/leveling/tiers", () => {
  it("checks the role and creates the tier under xvm-api's names", async () => {
    const res = await post({ name: "Regular", minLevel: 5, color: 0x00b4ff, icon: "\u2B50", discordRoleId: ROLE })
    expect(res.status).toBe(201)
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", ROLE)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", {
      name: "Regular",
      min_level: 5,
      color: 0x00b4ff,
      icon: "\u2B50",
      discord_role_id: ROLE,
    })
  })

  it("makes a plain tier with no Discord check", async () => {
    await post({ name: "Newcomer", minLevel: 0 })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { name: "Newcomer", min_level: 0 })
  })

  it("refuses a role the bot cannot hand out", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_not_in_guild" }, { status: 400 }) })
    expect((await post({ name: "Regular", minLevel: 5, discordRoleId: ROLE })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("rejects a missing level and an oversized colour", async () => {
    expect((await post({ name: "Regular" })).status).toBe(400)
    expect((await post({ name: "Regular", minLevel: 1, color: 0x1000000 })).status).toBe(400)
  })
})
