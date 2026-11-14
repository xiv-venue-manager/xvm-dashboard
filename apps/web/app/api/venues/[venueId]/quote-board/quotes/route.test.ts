import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

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
  listQuotes: m.list,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.list.mockResolvedValue([{ id: 9 }])
})

import { GET } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const get = (query = "") => GET(new Request(`http://localhost/api${query}`) as never, context as never)

describe("GET /api/venues/[venueId]/quote-board/quotes", () => {
  it("returns the first page with no cursor", async () => {
    const res = await get()
    expect(await res.json()).toEqual([{ id: 9 }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", {})
  })

  it("passes the cursor and limit through", async () => {
    await get("?beforeId=40&limit=25")
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", { beforeId: 40, limit: 25 })
  })

  it("rejects a cursor or limit that is not a valid number", async () => {
    for (const query of ["?beforeId=abc", "?beforeId=0", "?limit=0", "?limit=201", "?limit=1.5", "?limit=", "?beforeId="]) {
      expect((await get(query)).status).toBe(400)
    }
    expect(m.list).not.toHaveBeenCalled()
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
