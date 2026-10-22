import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  join: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ joinEventShift: m.join }))

import { POST } from "./route"

const ctx = (eventShiftId = "20") => ({ params: Promise.resolve({ venueId: "gilded-lily", eventShiftId }) })
const post = (eventShiftId?: string) => POST(new Request("http://localhost/api", { method: "POST" }), ctx(eventShiftId))

const seat = {
  id: 41,
  membership_id: 3,
  scheduled_start: "2026-10-11T19:00:00Z",
  scheduled_end: "2026-10-11T23:00:00Z",
  status: "pending_approval",
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.join.mockResolvedValue(seat)
})

describe("join an event shift", () => {
  it("joins against the venue resolved from the caller's xvm-api venues and returns the seat", async () => {
    const res = await post()
    expect(res.status).toBe(201)
    expect(m.join).toHaveBeenCalledWith("tok", "ven_1", 20)
    expect((await res.json()).shift).toMatchObject({ id: 41, membershipId: 3, status: "CLAIMED" })
  })

  it("answers 404 for a venue the caller cannot see", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await post()).status).toBe(404)
    expect(m.join).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await post()).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric event shift id before resolving the venue", async () => {
    expect((await post("abc")).status).toBe(404)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
