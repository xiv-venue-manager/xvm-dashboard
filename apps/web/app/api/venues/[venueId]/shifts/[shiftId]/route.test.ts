import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  claim: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  claimShift: m.claim,
  approveShift: m.approve,
  rejectShift: m.reject,
  clockInShift: m.clockIn,
  clockOutShift: m.clockOut,
  cancelShift: m.cancel,
}))

import { PATCH, DELETE } from "./route"

type Ctx = { params: Promise<{ venueId: string; shiftId: string }> }
const ctx = (shiftId = "5"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", shiftId }) })
const patch = (body: unknown, shiftId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), ctx(shiftId))
const del = (shiftId?: string) => DELETE(new Request("http://localhost/api", { method: "DELETE" }), ctx(shiftId))

const row = {
  id: 5,
  membership_id: 3,
  position_id: 2,
  event_id: null,
  scheduled_start: "2026-10-02T19:00:00Z",
  scheduled_end: "2026-10-02T23:00:00Z",
  actual_start: null,
  actual_end: null,
  status: "scheduled",
  notes: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  for (const fn of [m.claim, m.approve, m.reject, m.clockIn, m.clockOut, m.cancel]) fn.mockResolvedValue(row)
})

describe("shift actions", () => {
  it.each([
    ["claim", () => m.claim],
    ["approve", () => m.approve],
    ["reject", () => m.reject],
    ["clock-in", () => m.clockIn],
    ["clock-out", () => m.clockOut],
  ])("runs %s against the venue resolved from the caller's xvm-api venues", async (action, fn) => {
    const res = await patch({ action })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(fn()).toHaveBeenCalledWith("tok", "ven_1", 5)
  })

  it("cancels a shift on delete", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(m.cancel).toHaveBeenCalledWith("tok", "ven_1", 5, null)
  })

  it("answers 404 for a venue the caller cannot see, on every action and on delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ action: "claim" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.cancel).not.toHaveBeenCalled()
  })

  it("rejects an unknown action", async () => {
    expect((await patch({ action: "teleport" })).status).toBe(400)
  })

  it("rejects a non-numeric shift id before resolving the venue", async () => {
    expect((await patch({ action: "claim" }, "abc")).status).toBe(404)
    expect((await del("abc")).status).toBe(404)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
