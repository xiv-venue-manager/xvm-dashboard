import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ listPayrollChunked: m.list, createPayrollEntry: m.create }))

import { GET, POST } from "./route"
import { gilToMinorUnits } from "@/lib/api/position-convert"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = (query = "?from=2026-10-01&to=2026-10-07") =>
  (GET as unknown as Handler)(new NextRequest(`http://localhost/api/venues/gilded-lily/payroll${query}`), ctx)
const post = (body: unknown) =>
  (POST as unknown as Handler)(
    new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body) }),
    ctx
  )

const row = {
  id: 9,
  membership_id: 3,
  payment_type: "hourly",
  base_rate_minor: gilToMinorUnits(5000),
  minutes_worked: 120,
  bonus_amount_minor: null,
  total_amount_minor: gilToMinorUnits(10000),
  period_start: "2026-10-01T00:00:00Z",
  period_end: "2026-10-07T00:00:00Z",
  is_paid: false,
  paid_at: null,
  pot_distribution_id: null,
  notes: null,
}

const valid = {
  membershipId: 3,
  paymentType: "HOURLY",
  baseRate: 5000,
  hoursWorked: 2,
  periodStart: "2026-10-01T00:00:00Z",
  periodEnd: "2026-10-07T00:00:00Z",
}

const unseen = () => m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.list.mockResolvedValue([row])
  m.create.mockResolvedValue(row)
})

describe("payroll collection", () => {
  it("lists entries for the venue resolved from the caller's xvm-api venues", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "ven_1", expect.objectContaining({ membershipId: undefined }))
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 9, membershipId: 3, paymentType: "HOURLY", hoursWorked: 2, isPaid: false })
  })

  it("requires from and to", async () => {
    expect((await get("")).status).toBe(400)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on list and create", async () => {
    unseen()
    expect((await get()).status).toBe(404)
    expect((await post(valid)).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("creates an entry against the resolved venue, converting gil and hours for xvm-api", async () => {
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      expect.objectContaining({
        membership_id: 3,
        payment_type: "hourly",
        base_rate_minor: gilToMinorUnits(5000),
        minutes_worked: 120,
      })
    )
  })

  it("rejects an hourly entry with no hours before calling xvm-api", async () => {
    const res = await post({ ...valid, hoursWorked: undefined })
    expect(res.status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
