import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
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
  updateVipPerk: m.update,
  deleteVipPerk: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 5 })
  m.remove.mockResolvedValue(undefined)
})

import { PATCH, DELETE } from "./route"

const context = (perkId = "5") => ({ params: Promise.resolve({ venueId: "vn_1", perkId }) })
const patch = (body: unknown, perkId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(perkId) as never)

describe("PATCH /api/venues/[venueId]/vips/perks/[perkId]", () => {
  it("maps the fields it was given and clears a blank description", async () => {
    await patch({ name: "Free dessert", repeatability: "once", description: " " })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, { name: "Free dessert", repeatability: "once", description: null })
  })

  it("rejects an empty body and a bad id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ name: "x" }, "abc")).status).toBe(400)
  })
})

describe("DELETE /api/venues/[venueId]/vips/perks/[perkId]", () => {
  it("deletes the perk and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 5)
  })
})
