import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ getFinanceSettings: m.get, updateFinanceSettings: m.update }))

import { GET, PUT } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const put = (body: unknown) =>
  (PUT as unknown as Handler)(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }), ctx)

const settings = { tax_basis_points: 1000, include_sales_in_pot: true, default_tip_pooled: false }

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.get.mockResolvedValue(settings)
  m.update.mockResolvedValue(settings)
})

describe("pot-settings", () => {
  it("reads the settings of the venue resolved from the caller's xvm-api venues, in percent", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.get).toHaveBeenCalledWith("tok", "ven_1")
    expect(await res.json()).toEqual({ settings: { taxPercent: 10, includeSalesInPot: true, defaultTipPooled: false } })
  })

  it("saves settings against the resolved venue, converting percent to basis points", async () => {
    const res = await put({ taxPercent: 10, includeSalesInPot: true })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      expect.objectContaining({ tax_basis_points: 1000, include_sales_in_pot: true })
    )
  })

  it("rejects a tax over 100 percent before calling xvm-api", async () => {
    expect((await put({ taxPercent: 150 })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on read and save", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect((await put({ taxPercent: 5 })).status).toBe(404)
    expect(m.get).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })
})
