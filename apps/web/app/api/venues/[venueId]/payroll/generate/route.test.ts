import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  getVenue: vi.fn(),
  listShifts: vi.fn(),
  listPayroll: vi.fn(),
  listPositions: vi.fn(),
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
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getVenue: m.getVenue,
  listShiftsChunked: m.listShifts,
  listPayrollChunked: m.listPayroll,
  listPositions: m.listPositions,
  createPayrollEntry: m.create,
}))

import { GET, POST } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = (query = "") =>
  (GET as unknown as Handler)(new NextRequest(`http://localhost/api/venues/gilded-lily/payroll/generate${query}`), ctx)
const post = (body: unknown = {}) =>
  (POST as unknown as Handler)(
    new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body) }),
    ctx
  )

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.getVenue.mockResolvedValue({ timezone: "UTC" })
  m.listShifts.mockResolvedValue([])
  m.listPayroll.mockResolvedValue([])
  m.listPositions.mockResolvedValue([])
})

describe("payroll generate", () => {
  it("answers 404 for a venue the caller cannot see, on preview and create", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get("?membershipId=3&periodStart=2026-10-01&periodEnd=2026-10-07")).status).toBe(404)
    expect((await post()).status).toBe(404)
    expect(m.getVenue).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await get("?membershipId=3&periodStart=2026-10-01&periodEnd=2026-10-07")).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("requires a membership and a period for the preview", async () => {
    expect((await get("?periodStart=2026-10-01&periodEnd=2026-10-07")).status).toBe(400)
    expect(m.getVenue).not.toHaveBeenCalled()
  })

  it("previews against the resolved venue id, reading its shifts and positions", async () => {
    const res = await get("?membershipId=3&periodStart=2026-10-01&periodEnd=2026-10-07")
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.getVenue).toHaveBeenCalledWith("tok", "ven_1")
    expect(m.listShifts).toHaveBeenCalledWith("tok", "ven_1", expect.any(Object))
    expect(m.listPositions).toHaveBeenCalledWith("tok", "ven_1")
  })
})
