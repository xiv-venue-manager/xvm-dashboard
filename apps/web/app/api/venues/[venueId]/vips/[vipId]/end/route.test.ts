import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  end: vi.fn(),
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
  endVip: m.end,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.end.mockResolvedValue({ id: 7 })
})

import { POST } from "./route"

const context = (vipId = "7") => ({ params: Promise.resolve({ venueId: "vn_1", vipId }) })
const call = (vipId?: string) => POST(new Request("http://localhost/api", { method: "POST" }) as never, context(vipId) as never)

describe("POST /api/venues/[venueId]/vips/[vipId]/end", () => {
  it("ends the VIP", async () => {
    expect((await call()).status).toBe(200)
    expect(m.end).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("rejects a bad id", async () => {
    expect((await call("abc")).status).toBe(400)
    expect(m.end).not.toHaveBeenCalled()
  })
})
