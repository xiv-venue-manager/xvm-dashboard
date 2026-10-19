import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  getVenue: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidate,
  cacheKeys: { userVenues: (id: string) => `user-venues:${id}` },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  getVenue: m.getVenue,
  uploadVenueImage: m.upload,
  deleteVenueImage: m.remove,
}))

import { GET, POST, DELETE } from "./route"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const ctx = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"), ctx)
const post = () =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: new FormData() }), ctx)
const del = (body: unknown) =>
  (DELETE as unknown as Handler)(
    new Request("http://localhost/api", { method: "DELETE", body: JSON.stringify(body) }),
    ctx
  )

const unseen = () => m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.getVenue.mockResolvedValue({ images: [{ id: 7, image_url: "https://img/7.png" }] })
  m.remove.mockResolvedValue(undefined)
  m.invalidate.mockResolvedValue(undefined)
})

describe("gallery", () => {
  it("lists the images of the venue resolved from the caller's xvm-api venues", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.getVenue).toHaveBeenCalledWith("tok", "ven_1")
    expect(await res.json()).toEqual([{ id: 7, image_url: "https://img/7.png" }])
  })

  it("deletes an image against the resolved venue and drops the caller's venue list cache", async () => {
    const res = await del({ imageId: 7 })
    expect(res.status).toBe(200)
    expect(m.remove).toHaveBeenCalledWith("tok", "ven_1", 7)
    expect(m.invalidate).toHaveBeenCalledWith("user-venues:u1")
  })

  it("requires an image id to delete", async () => {
    expect((await del({})).status).toBe(400)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, on list, upload and delete", async () => {
    unseen()
    expect((await get()).status).toBe(404)
    expect((await post()).status).toBe(404)
    expect((await del({ imageId: 7 })).status).toBe(404)
    expect(m.getVenue).not.toHaveBeenCalled()
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })
})
