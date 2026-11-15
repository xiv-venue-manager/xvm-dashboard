import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  act: vi.fn(),
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
  profileAction: m.act,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.act.mockResolvedValue({ id: 5 })
})

import { POST } from "./route"

const context = (profileId = "5") => ({ params: Promise.resolve({ venueId: "vn_1", profileId }) })
const call = (profileId?: string) => POST(new Request("http://localhost/api", { method: "POST" }) as never, context(profileId) as never)

describe("POST /api/venues/[venueId]/profiles/[profileId]/approve", () => {
  it("runs the approve action on the sheet", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(m.act).toHaveBeenCalledWith("tok", "xv-1", 5, "approve")
  })

  it("rejects a bad sheet id", async () => {
    expect((await call("abc")).status).toBe(400)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })
})
