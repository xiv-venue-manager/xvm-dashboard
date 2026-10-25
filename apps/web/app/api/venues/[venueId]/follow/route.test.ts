import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  venueFind: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: m.venueFind } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  followVenue: m.follow,
  unfollowVenue: m.unfollow,
}))

import { POST, DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const ctx = { params: Promise.resolve({ venueId: "cm123" }) }
const post = () => POST(new Request("http://localhost/api/venues/cm123/follow", { method: "POST" }), ctx)
const del = () => DELETE(new Request("http://localhost/api/venues/cm123/follow", { method: "DELETE" }), ctx)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.venueFind.mockResolvedValue({ xvmApiVenueId: "ven_1" })
  m.follow.mockResolvedValue({})
  m.unfollow.mockResolvedValue(undefined)
})

describe.each([
  ["POST", post, true],
  ["DELETE", del, false],
] as const)("%s /api/venues/[venueId]/follow", (_verb, call, following) => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.follow).not.toHaveBeenCalled()
    expect(m.unfollow).not.toHaveBeenCalled()
  })

  it("is 404 for a venue that does not exist or is inactive", async () => {
    m.venueFind.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it("is 409 not_connected for a venue with no xvm-api id", async () => {
    m.venueFind.mockResolvedValue({ xvmApiVenueId: null })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
  })

  it("finds the venue by its id or its slug", async () => {
    await call()
    expect(m.venueFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ id: "cm123" }, { slug: "cm123" }], isActive: true } })
    )
  })

  it("forwards an upstream refusal", async () => {
    ;(following ? m.follow : m.unfollow).mockRejectedValue(new XvmApiError(404, "No such venue"))
    expect((await call()).status).toBe(404)
  })

  it("answers with the new following state", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ following })
  })
})

describe("what each verb sends to xvm-api", () => {
  it("POST follows the venue by its xvm-api id with the person's token", async () => {
    await post()
    expect(m.follow).toHaveBeenCalledWith("tok", "ven_1")
    expect(m.unfollow).not.toHaveBeenCalled()
  })

  it("DELETE unfollows the venue by its xvm-api id with the person's token", async () => {
    await del()
    expect(m.unfollow).toHaveBeenCalledWith("tok", "ven_1")
    expect(m.follow).not.toHaveBeenCalled()
  })
})
