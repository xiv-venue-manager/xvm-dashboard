import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  fulfill: vi.fn(),
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
  fulfillVipRedemption: m.fulfill,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.fulfill.mockResolvedValue({ id: 11 })
})

import { POST } from "./route"

const context = (redemptionId = "11") => ({ params: Promise.resolve({ venueId: "vn_1", redemptionId }) })
const call = (redemptionId?: string) => POST(new Request("http://localhost/api", { method: "POST" }) as never, context(redemptionId) as never)

describe("POST /api/venues/[venueId]/vips/redemptions/[redemptionId]/fulfill", () => {
  it("marks the redemption fulfilled", async () => {
    expect((await call()).status).toBe(200)
    expect(m.fulfill).toHaveBeenCalledWith("tok", "xv-1", 11)
  })

  it("rejects a bad id", async () => {
    expect((await call("0")).status).toBe(400)
    expect(m.fulfill).not.toHaveBeenCalled()
  })
})
