import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  list: vi.fn(),
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
  listVipRedemptions: m.list,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.list.mockResolvedValue([{ id: 1 }])
})

import { GET } from "./route"

const context = (vipId = "7") => ({ params: Promise.resolve({ venueId: "vn_1", vipId }) })
const get = (vipId?: string) => GET(new Request("http://localhost/api") as never, context(vipId) as never)

describe("GET /api/venues/[venueId]/vips/[vipId]/redemptions", () => {
  it("returns the VIP's redemptions", async () => {
    const res = await get()
    expect(await res.json()).toEqual([{ id: 1 }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("rejects a bad id and answers 401 with no session", async () => {
    expect((await get("abc")).status).toBe(400)
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
