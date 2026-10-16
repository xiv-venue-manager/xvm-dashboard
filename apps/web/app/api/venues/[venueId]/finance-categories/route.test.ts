import { describe, it, expect, vi, beforeEach } from "vitest"

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
vi.mock("@/lib/api/xvm-api", () => ({ listFinanceCategories: m.list, createFinanceCategory: m.create }))

import { GET, POST } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const post = (body: unknown) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx)

const category = { id: 3, name: "Supplies", sort_order: 0, applies_to: "expense" }

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.list.mockResolvedValue([category])
  m.create.mockResolvedValue(category)
})

describe("finance-categories collection", () => {
  it("lists categories for the venue resolved from the caller's xvm-api venues", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "ven_1")
    expect(await res.json()).toEqual([category])
  })

  it("creates a category against the resolved venue", async () => {
    const res = await post({ name: "Supplies", applies_to: "expense" })
    expect(res.status).toBeLessThan(300)
    expect(m.create).toHaveBeenCalledWith("tok", "ven_1", { name: "Supplies", applies_to: "expense" })
  })

  it("rejects unknown fields and bad kinds before calling xvm-api", async () => {
    expect((await post({ name: "x", extra: 1 })).status).toBe(400)
    expect((await post({ name: "x", applies_to: "bonus" })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on list and create", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect((await post({ name: "Supplies" })).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })
})
