import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  role: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  tiers: vi.fn(),
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
  updateVipTier: m.update,
  deleteVipTier: m.remove,
  listVipTiers: m.tiers,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.update.mockResolvedValue({ id: 2 })
  m.remove.mockResolvedValue(undefined)
  m.tiers.mockResolvedValue([{ id: 2, discord_role_id: "1509616350337962099" }])
})

import { PATCH, DELETE } from "./route"

const ROLE = "1509616350337962099"
const OTHER = "1509616350337962100"
const context = (tierId = "2") => ({ params: Promise.resolve({ venueId: "vn_1", tierId }) })
const patch = (body: unknown, tierId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(tierId) as never)

describe("PATCH /api/venues/[venueId]/vips/tiers/[tierId]", () => {
  it("maps only the fields it was given, keeping a zero cost", async () => {
    await patch({ name: "Platinum", cost: 0 })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 2, { name: "Platinum", cost: 0 })
    expect(m.role).not.toHaveBeenCalled()
  })

  it("passes the tier's stored role as current to the role check", async () => {
    await patch({ discordRoleId: ROLE })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", ROLE, ROLE)
    await patch({ discordRoleId: OTHER })
    expect(m.role).toHaveBeenLastCalledWith("user-1", "vn_1", OTHER, ROLE)
  })

  it("clears the role and colour with null without a Discord check", async () => {
    await patch({ discordRoleId: null, color: null })
    expect(m.role).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 2, { discord_role_id: null, color: null })
  })

  it("rejects an empty body and a bad id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ name: "x" }, "abc")).status).toBe(400)
  })
})

describe("DELETE /api/venues/[venueId]/vips/tiers/[tierId]", () => {
  it("deletes the tier and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 2)
  })
})
