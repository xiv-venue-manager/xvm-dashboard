import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  getLink: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  getFfxivLink: m.getLink,
  linkFfxivListing: m.link,
  unlinkFfxivListing: m.unlink,
}))

import { GET, POST, DELETE } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const post = (body: unknown) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx)
const del = () => (DELETE as unknown as Handler)(new Request("http://localhost/api", { method: "DELETE" }), ctx)

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.getLink.mockResolvedValue({ linked: true })
  m.link.mockResolvedValue({ linked: true })
  m.unlink.mockResolvedValue(undefined)
})

describe("ffxivvenues link", () => {
  it("reads the link of the venue resolved from the caller's xvm-api venues", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.getLink).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("links a listing and unlinks it against the resolved venue", async () => {
    expect((await post({ ffxivvenuesId: "abc123" })).status).toBe(200)
    expect(m.link).toHaveBeenCalledWith("tok", "ven_1", "abc123")
    expect((await del()).status).toBe(204)
    expect(m.unlink).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("rejects an empty listing id before calling xvm-api", async () => {
    expect((await post({ ffxivvenuesId: "  " })).status).toBe(400)
    expect(m.link).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on read, link and unlink", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect((await post({ ffxivvenuesId: "abc123" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.getLink).not.toHaveBeenCalled()
    expect(m.link).not.toHaveBeenCalled()
    expect(m.unlink).not.toHaveBeenCalled()
  })
})
