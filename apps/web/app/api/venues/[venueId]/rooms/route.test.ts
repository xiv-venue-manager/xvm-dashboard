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
vi.mock("@/lib/api/xvm-api", () => ({ listRooms: m.list, createRoom: m.create }))

import { GET, POST } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const post = (body: unknown) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx)

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.list.mockResolvedValue([{ id: 4, name: "Suite" }])
  m.create.mockResolvedValue({ id: 5, name: "Annex" })
})

describe("rooms collection", () => {
  it("lists the rooms of the venue resolved from the caller's xvm-api venues", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("creates a room against the resolved venue", async () => {
    const res = await post({ name: "Annex" })
    expect(res.status).toBeLessThan(300)
    expect(m.create).toHaveBeenCalledWith("tok", "ven_1", { name: "Annex" })
  })

  it("rejects a blank name before calling xvm-api", async () => {
    expect((await post({ name: "  " })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on list and create", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect((await post({ name: "Annex" })).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })
})
