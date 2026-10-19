import { describe, it, expect, vi, beforeEach } from "vitest"

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
vi.mock("@/lib/api/xvm-api", () => ({ updateFinanceCategory: m.update, deleteFinanceCategory: m.remove }))

import { PATCH, DELETE } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; categoryId: string }> }) => Promise<Response>
const ctx = (categoryId = "3") => ({ params: Promise.resolve({ venueId: "gilded-lily", categoryId }) })
const patch = (body: unknown, categoryId?: string) =>
  (PATCH as unknown as Handler)(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(categoryId)
  )
const del = (categoryId?: string) =>
  (DELETE as unknown as Handler)(new Request("http://localhost/api", { method: "DELETE" }), ctx(categoryId))

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.update.mockResolvedValue({ id: 3, name: "Stock" })
  m.remove.mockResolvedValue(undefined)
})

describe("finance-categories item", () => {
  it("renames a category against the venue resolved from the caller's xvm-api venues", async () => {
    const res = await patch({ name: "Stock" })
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.update).toHaveBeenCalledWith("tok", "ven_1", 3, { name: "Stock" })
  })

  it("deletes a category", async () => {
    const res = await del()
    expect(res.status).toBeLessThan(300)
    expect(m.remove).toHaveBeenCalledWith("tok", "ven_1", 3)
  })

  it("answers 404 for a venue the caller cannot see, on update and delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await patch({ name: "Stock" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects unknown fields before calling xvm-api", async () => {
    expect((await patch({ name: "Stock", extra: 1 })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
