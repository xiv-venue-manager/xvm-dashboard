import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenueRole: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listServices: m.list,
  createService: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
})

import { GET, POST } from "./route"

const context = { params: Promise.resolve({ venueId: "my-venue" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("GET /api/venues/[venueId]/services", () => {
  it("lists the services of the xvm-api venue the ref resolves to", async () => {
    m.list.mockResolvedValue([{ id: 1 }])
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(await res.json()).toEqual([{ id: 1 }])
    expect(m.lookup).toHaveBeenCalledWith("user-1", "my-venue", "STAFF", expect.any(String), expect.any(String))
    expect(m.list).toHaveBeenCalledWith("tok", "xv-1")
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await GET(new Request("http://localhost/api") as never, context as never)).status).toBe(404)
    expect(m.list).not.toHaveBeenCalled()
  })
})

describe("POST /api/venues/[venueId]/services", () => {
  it("needs a manager and creates against the resolved venue", async () => {
    m.create.mockResolvedValue({ id: 2 })
    const res = await post({ name: "Cocktail", description: "", price: 5 })
    expect(res.status).toBe(201)
    expect(m.lookup).toHaveBeenCalledWith("user-1", "my-venue", "MANAGER", expect.any(String), expect.any(String))
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", expect.objectContaining({ name: "Cocktail" }))
  })

  it("answers the helper's refusal and creates nothing", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "no" }, { status: 403 }) })
    expect((await post({ name: "Cocktail", description: "", price: 5 })).status).toBe(403)
    expect(m.create).not.toHaveBeenCalled()
  })
})
