import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  list: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ listShifts: m.list }))

import { GET } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = (query = "?from=2026-10-01T00:00:00Z&to=2026-10-08T00:00:00Z") =>
  (GET as unknown as Handler)(new NextRequest(`http://localhost/api/venues/gilded-lily/shifts${query}`), ctx)

const row = {
  id: 5,
  membership_id: 3,
  position_id: 2,
  event_id: null,
  scheduled_start: "2026-10-02T19:00:00Z",
  scheduled_end: "2026-10-02T23:00:00Z",
  actual_start: null,
  actual_end: null,
  status: "pending_approval",
  notes: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.list.mockResolvedValue([row])
})

describe("shifts collection", () => {
  it("lists shifts for the venue resolved from the caller's xvm-api venues, in the dashboard shape", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "ven_1", expect.objectContaining({ includeCancelled: true }))
    const body = await res.json()
    expect(body.shifts[0]).toMatchObject({ id: 5, membershipId: 3, roleId: 2, status: "CLAIMED" })
  })

  it("answers 404 for a venue the caller cannot see, on list", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
