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
  updateVipSettings: m.update,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ warning_days: 3 })
})

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
import { PUT } from "./route"

const put = (body: unknown) => PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/vips/settings", () => {
  it("saves the warning days, or null to turn warnings off", async () => {
    await put({ warningDays: 5 })
    expect(m.update).toHaveBeenLastCalledWith("tok", "xv-1", { warning_days: 5 })
    await put({ warningDays: null })
    expect(m.update).toHaveBeenLastCalledWith("tok", "xv-1", { warning_days: null })
  })

  it("rejects 0, 11 and a missing value", async () => {
    expect((await put({ warningDays: 0 })).status).toBe(400)
    expect((await put({ warningDays: 11 })).status).toBe(400)
    expect((await put({})).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
