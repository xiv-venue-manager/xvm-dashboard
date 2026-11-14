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
  listActivity: m.list,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.list.mockResolvedValue([{ id: 1 }])
})

import { GET } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const get = (query = "") => GET(new Request(`http://localhost/api${query}`) as never, context as never)

describe("GET /api/venues/[venueId]/activity", () => {
  it("returns the newest page with no filters", async () => {
    const res = await get()
    expect(await res.json()).toEqual([{ id: 1 }])
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", {})
  })

  it("passes every filter through", async () => {
    await get("?module=shifts&actorPersonId=7&from=2026-11-01T00:00:00.000Z&to=2026-11-14T23:59:59.999Z&limit=25")
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1", {
      module: "shifts",
      actorPersonId: 7,
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-14T23:59:59.999Z",
      limit: 25,
    })
  })

  it("rejects values xvm-api would not accept", async () => {
    for (const query of [
      "?module=nope",
      "?actorPersonId=abc",
      "?actorPersonId=0",
      "?from=yesterday",
      "?to=2026-11-14",
      "?limit=0",
      "?limit=201",
      "?limit=",
      "?actorPersonId=",
    ]) {
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
