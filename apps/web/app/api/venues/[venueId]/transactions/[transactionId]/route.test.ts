import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  update: vi.fn(),
  voidTx: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ updateFinanceTransaction: m.update, voidFinanceTransaction: m.voidTx }))

import { PATCH, DELETE } from "./route"
import { gilToMinorUnits } from "@/lib/api/position-convert"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string; transactionId: string }> }) => Promise<Response>
const ctx = (transactionId = "12") => ({ params: Promise.resolve({ venueId: "gilded-lily", transactionId }) })
const patch = (body: unknown) =>
  (PATCH as unknown as Handler)(
    new NextRequest("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    ctx()
  )
const del = () => (DELETE as unknown as Handler)(new NextRequest("http://localhost/api", { method: "DELETE" }), ctx())

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.update.mockResolvedValue({ id: 12 })
  m.voidTx.mockResolvedValue(undefined)
})

describe("transaction item", () => {
  it("updates a transaction against the venue resolved from the caller's xvm-api venues", async () => {
    const res = await patch({ amount: 2500, customerName: "Mira" })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.update).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      12,
      expect.objectContaining({ amount: gilToMinorUnits(2500), customer_name: "Mira" })
    )
  })

  it("voids a transaction on delete", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(m.voidTx).toHaveBeenCalledWith("tok", "ven_1", 12, { reason: "Deleted via dashboard" })
  })

  it("answers 404 for a venue the caller cannot see, on update and delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ notes: "x" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.voidTx).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await patch({ notes: "x" })).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
