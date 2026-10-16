import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ updatePayrollEntry: m.update, deletePayrollEntry: m.remove }))

import { PATCH, DELETE } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string; payrollId: string }> }) => Promise<Response>
const ctx = (payrollId = "9") => ({ params: Promise.resolve({ venueId: "gilded-lily", payrollId }) })
const patch = (body: unknown, payrollId?: string) =>
  (PATCH as unknown as Handler)(
    new NextRequest("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(payrollId)
  )
const del = (payrollId?: string) =>
  (DELETE as unknown as Handler)(new NextRequest("http://localhost/api", { method: "DELETE" }), ctx(payrollId))

const row = {
  id: 9,
  membership_id: 3,
  payment_type: "fixed_salary",
  base_rate_minor: 500000,
  minutes_worked: 0,
  bonus_amount_minor: null,
  total_amount_minor: 500000,
  period_start: "2026-10-01T00:00:00Z",
  period_end: "2026-10-07T00:00:00Z",
  is_paid: true,
  paid_at: "2026-10-08T00:00:00Z",
  pot_distribution_id: null,
  notes: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.update.mockResolvedValue(row)
  m.remove.mockResolvedValue(undefined)
})

describe("payroll entry", () => {
  it("marks an entry paid against the venue resolved from the caller's xvm-api venues", async () => {
    const res = await patch({ isPaid: true })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.update).toHaveBeenCalledWith("tok", "ven_1", 9, { is_paid: true, notes: undefined })
    expect(await res.json()).toMatchObject({ id: 9, isPaid: true, paymentType: "FIXED_SALARY" })
  })

  it("deletes an entry", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(m.remove).toHaveBeenCalledWith("tok", "ven_1", 9)
  })

  it("answers 404 for a venue the caller cannot see, on update and delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ isPaid: true })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric entry id before resolving the venue", async () => {
    expect((await patch({ isPaid: true }, "abc")).status).toBe(400)
    expect((await del("abc")).status).toBe(400)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("rejects unknown fields on update", async () => {
    expect((await patch({ isPaid: true, baseRate: 1 })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
