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
  updateProfileSettings: m.update,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ approval_required: true })
})

import { PUT } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) => PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/profile-settings", () => {
  it("saves the approval switch under xvm-api's name", async () => {
    expect((await put({ approvalRequired: false })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", { approval_required: false })
  })

  it("rejects a missing or non-boolean switch", async () => {
    expect((await put({})).status).toBe(400)
    expect((await put({ approvalRequired: "yes" })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
