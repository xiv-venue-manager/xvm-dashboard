import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  reject: vi.fn(),
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
  rejectProfile: m.reject,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.reject.mockResolvedValue({ id: 5 })
})

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", profileId: "5" }) }
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/profiles/[profileId]/reject", () => {
  it("sends the trimmed reason", async () => {
    const res = await post({ reason: "  Needs a picture " })
    expect(res.status).toBe(200)
    expect(m.reject).toHaveBeenCalledWith("tok", "xv-1", 5, { reason: "Needs a picture" })
  })

  it("rejects a missing, blank or 501-character reason", async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ reason: "  " })).status).toBe(400)
    expect((await post({ reason: "x".repeat(501) })).status).toBe(400)
    expect(m.reject).not.toHaveBeenCalled()
  })
})
