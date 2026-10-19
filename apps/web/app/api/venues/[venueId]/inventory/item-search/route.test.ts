import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  requireVenue: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-access")>()),
  requireMyVenue: m.requireVenue,
}))

import { GET } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const search = (query = "potion") =>
  (GET as unknown as Handler)(
    new NextRequest(`http://localhost/api/venues/gilded-lily/inventory/item-search?query=${query}`),
    { params: Promise.resolve({ venueId: "gilded-lily" }) }
  )

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "MANAGER" } })
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ results: [{ row_id: 27, fields: { Name: "Hi-Potion", Icon: { id: 20001 } } }] }))
  )
})

afterEach(() => vi.unstubAllGlobals())

describe("item search", () => {
  it("resolves the venue from the caller's xvm-api venues and returns the matching items", async () => {
    const res = await search()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(await res.json()).toEqual({ items: [{ itemId: 27, name: "Hi-Potion", iconId: 20001 }] })
  })

  it("lets an owner search too", async () => {
    m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "OWNER" } })
    expect((await search()).status).toBe(200)
  })

  it("refuses staff with 403 and does not call XIVAPI", async () => {
    m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "STAFF" } })
    const res = await search()
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await search()).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a query under two characters before calling XIVAPI", async () => {
    expect((await search("a")).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
