import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
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

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
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

describe("a card that carries an xvm-api venue id", () => {
  const xvmCtx = { params: Promise.resolve({ venueId: "ven_1" }) }

  it("looks the venue up by that id and follows it", async () => {
    const res = await POST(new Request("http://localhost/api/venues/ven_1/follow", { method: "POST" }), xvmCtx)
    expect(res.status).toBe(200)
    expect(m.venueFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ xvmApiVenueId: "ven_1" }]) }) })
    )
    expect(m.follow).toHaveBeenCalledWith("tok", "ven_1")
  })
})

describe("what each verb sends to xvm-api", () => {
  it("POST follows the venue by the id in the path with the person's token", async () => {
    await post()
    expect(m.follow).toHaveBeenCalledWith("tok", "cm123")
    expect(m.unfollow).not.toHaveBeenCalled()
  })

  it("DELETE unfollows the venue by the id in the path with the person's token", async () => {
    await del()
    expect(m.unfollow).toHaveBeenCalledWith("tok", "cm123")
    expect(m.follow).not.toHaveBeenCalled()
  })
})
