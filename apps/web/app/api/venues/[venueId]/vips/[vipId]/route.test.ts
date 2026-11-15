import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  update: vi.fn(),
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
  updateVip: m.update,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 7 })
})

import { PATCH } from "./route"

const context = (vipId = "7") => ({ params: Promise.resolve({ venueId: "vn_1", vipId }) })
const patch = (body: unknown, vipId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(vipId) as never)

describe("PATCH /api/venues/[venueId]/vips/[vipId]", () => {
  it("extends the expiry and updates the notes", async () => {
    await patch({ expiresAt: "2027-01-01T00:00:00.000Z", notes: "Extended" })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { expires_at: "2027-01-01T00:00:00.000Z", notes: "Extended" })
  })

  it("makes a VIP lifetime with a null expiry and clears notes with a blank", async () => {
    await patch({ expiresAt: null, notes: "  " })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { expires_at: null, notes: null })
  })

  it("rejects an empty body, a bad date and a bad id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ expiresAt: "soon" })).status).toBe(400)
    expect((await patch({ notes: "x" }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
