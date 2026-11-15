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
  listFormResponses: m.list,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.list.mockResolvedValue([{ id: 3 }])
})

import { GET } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", formId: "4" }) }
const get = (query = "") => GET(new Request(`http://localhost/api${query}`) as never, context as never)

describe("GET /api/venues/[venueId]/forms/[formId]/responses", () => {
  it("reads the newest page", async () => {
    const res = await get()
    expect(await res.json()).toEqual([{ id: 3 }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", 4, { limit: 50 })
  })

  it("reads the page before a response id", async () => {
    await get("?beforeId=120")
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", 4, { limit: 50, beforeId: 120 })
  })

  it("rejects a bad beforeId", async () => {
    expect((await get("?beforeId=abc")).status).toBe(400)
    expect((await get("?beforeId=0")).status).toBe(400)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
