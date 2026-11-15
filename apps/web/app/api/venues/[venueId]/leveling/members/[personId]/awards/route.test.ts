import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  guild: vi.fn(),
  awards: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({  }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listLevelingAwards: m.awards,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.awards.mockResolvedValue([{ id: 1 }])
})

import { GET } from "./route"

const context = (personId = "12") => ({ params: Promise.resolve({ venueId: "vn_1", personId }) })
const get = (personId?: string) => GET(new Request("http://localhost/api") as never, context(personId) as never)

describe("GET /api/venues/[venueId]/leveling/members/[personId]/awards", () => {
  it("returns the person's awards", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 1 }])
    expect(m.awards).toHaveBeenCalledWith("tok", "xv-1", 12)
  })

  it("rejects a bad person id", async () => {
    expect((await get("abc")).status).toBe(400)
    expect((await get("0")).status).toBe(400)
    expect(m.awards).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
