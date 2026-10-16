import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  sync: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ syncFfxivListing: m.sync }))

import { POST } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const post = () => (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST" }), ctx)

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.sync.mockResolvedValue({ synced: true })
})

describe("ffxivvenues sync", () => {
  it("syncs the listing of the venue resolved from the caller's xvm-api venues", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.sync).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("answers 404 for a venue the caller cannot see, without syncing", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await post()).status).toBe(404)
    expect(m.sync).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await post()).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
