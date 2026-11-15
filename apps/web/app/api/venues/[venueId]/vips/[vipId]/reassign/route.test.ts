import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  reassign: vi.fn(),
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
  reassignVip: m.reassign,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.reassign.mockResolvedValue({ id: 7 })
})

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", vipId: "7" }) }
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/vips/[vipId]/reassign", () => {
  it("moves the VIP to another tier", async () => {
    expect((await post({ tierId: 3 })).status).toBe(200)
    expect(m.reassign).toHaveBeenCalledWith("tok", "xv-1", 7, { tier_id: 3 })
  })

  it("rejects a missing or non-positive tier", async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ tierId: 0 })).status).toBe(400)
    expect(m.reassign).not.toHaveBeenCalled()
  })
})
