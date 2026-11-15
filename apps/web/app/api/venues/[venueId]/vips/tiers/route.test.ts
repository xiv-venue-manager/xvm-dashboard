import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
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
  createVipTier: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.create.mockResolvedValue({ id: 2 })
})

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
import { POST } from "./route"

const ROLE = "1509616350337962099"
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/vips/tiers", () => {
  it("checks the role and creates the tier under xvm-api's names", async () => {
    const res = await post({ name: "Gold", description: "Top shelf", cost: 5000000, color: 0xffd700, discordRoleId: ROLE, sortOrder: 1 })
    expect(res.status).toBe(201)
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", ROLE)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", {
      name: "Gold",
      description: "Top shelf",
      cost: 5000000,
      color: 0xffd700,
      discord_role_id: ROLE,
      sort_order: 1,
    })
  })

  it("makes a plain tier with no Discord check", async () => {
    await post({ name: "Silver" })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { name: "Silver" })
  })

  it("refuses a role the bot cannot hand out and a negative cost", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_not_in_guild" }, { status: 400 }) })
    expect((await post({ name: "Gold", discordRoleId: ROLE })).status).toBe(400)
    expect((await post({ name: "Gold", cost: -1 })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
