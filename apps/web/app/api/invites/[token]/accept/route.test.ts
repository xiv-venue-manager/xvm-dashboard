import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  acceptInvite: vi.fn(),
  resolveMyVenue: vi.fn(),
  invalidateCache: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => {
  throw new Error("must not read Prisma")
})
vi.mock("@/lib/discord-webhook", () => {
  throw new Error("must not send a webhook")
})
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: vi.fn(),
}))
vi.mock("@/lib/api/xvm-api", () => ({ acceptInvite: m.acceptInvite }))
vi.mock("@/lib/api/venue-access", () => ({ resolveMyVenue: m.resolveMyVenue }))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidateCache,
  cacheKeys: { userVenues: (id: string) => `venues:${id}` },
}))

import { POST } from "./route"

const membership = { id: 11, venue_id: "ven_1", tier: "staff", nickname: "Bobby" }
const context = { params: Promise.resolve({ token: "inv_tok" }) }
const call = () => POST(new Request("http://localhost/x", { method: "POST" }), context)

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.acceptInvite.mockResolvedValue(membership)
})

describe("invite accept", () => {
  it("returns the membership and the venue name and slug from the caller's venues", async () => {
    m.resolveMyVenue.mockResolvedValue({ id: "ven_1", name: "Gilded Lily", slug: "gilded-lily" })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      membership: { id: 11, role: "STAFF" },
      venue: { name: "Gilded Lily", slug: "gilded-lily" },
    })
    expect(m.acceptInvite).toHaveBeenCalledWith("tok", "inv_tok")
    expect(m.invalidateCache).toHaveBeenCalledWith("venues:u1")
    expect(m.resolveMyVenue).toHaveBeenCalledWith("u1", "ven_1")
  })

  it("still succeeds with a null venue when the venue is not found", async () => {
    m.resolveMyVenue.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, membership: { id: 11, role: "STAFF" }, venue: null })
  })

  it("still succeeds with a null venue when the venue lookup rejects", async () => {
    m.resolveMyVenue.mockRejectedValue(new Error("down"))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await call()
    expect(warn).toHaveBeenCalledWith("[invites/accept] venue lookup failed", expect.any(Error))
    warn.mockRestore()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, membership: { id: 11, role: "STAFF" }, venue: null })
  })

  it("refuses an unauthenticated caller", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.acceptInvite).not.toHaveBeenCalled()
  })
})
