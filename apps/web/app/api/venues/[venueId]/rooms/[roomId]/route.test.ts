import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  getRoom: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/plugin-auth", () => ({ pluginAuthGate: vi.fn() }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ getRoom: m.getRoom, updateRoom: m.update, deleteRoom: m.remove }))

import { GET, PATCH, DELETE } from "./route"

type Handler = (req: NextRequest, ctx: { params: Promise<{ venueId: string; roomId: string }> }) => Promise<Response>
const ctx = (roomId = "4") => ({ params: Promise.resolve({ venueId: "gilded-lily", roomId }) })
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) })
const get = (roomId?: string) => (GET as unknown as Handler)(req("GET"), ctx(roomId))
const patch = (body: unknown, roomId?: string) => (PATCH as unknown as Handler)(req("PATCH", body), ctx(roomId))
const del = (roomId?: string) => (DELETE as unknown as Handler)(req("DELETE"), ctx(roomId))

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.getRoom.mockResolvedValue({ id: 4, name: "Suite" })
  m.update.mockResolvedValue({ id: 4, name: "Grand Suite" })
  m.remove.mockResolvedValue(undefined)
})

describe("room item", () => {
  it("reads, renames and deletes a room against the venue resolved from the caller's xvm-api venues", async () => {
    expect((await get()).status).toBe(200)
    expect(m.getRoom).toHaveBeenCalledWith("tok", "ven_1", 4)
    expect((await patch({ name: "Grand Suite" })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "ven_1", 4, { name: "Grand Suite" })
    expect((await del()).status).toBeLessThan(300)
    expect(m.remove).toHaveBeenCalledWith("tok", "ven_1", 4)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
  })

  it("answers 404 for a venue the caller cannot see, on read, update and delete", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    expect((await get()).status).toBe(404)
    expect((await patch({ name: "x" })).status).toBe(404)
    expect((await del()).status).toBe(404)
    expect(m.getRoom).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric room id before resolving the venue", async () => {
    expect((await get("abc")).status).toBe(400)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request", async () => {
    m.session.mockResolvedValue(null)
    expect((await patch({ name: "x" })).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })
})
