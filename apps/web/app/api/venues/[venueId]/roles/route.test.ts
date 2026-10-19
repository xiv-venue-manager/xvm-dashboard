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
  listPositions: m.list,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
})

import { GET } from "./route"

const context = { params: Promise.resolve({ venueId: "my-venue" }) }

describe("GET /api/venues/[venueId]/roles", () => {
  it("lists the positions of the xvm-api venue the ref resolves to", async () => {
    m.list.mockResolvedValue([])
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(res.status).toBe(200)
    expect(m.lookup).toHaveBeenCalledWith("user-1", "my-venue", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1")
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await GET(new Request("http://localhost/api") as never, context as never)).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })
})
