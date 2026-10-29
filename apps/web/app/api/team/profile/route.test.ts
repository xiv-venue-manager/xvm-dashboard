import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), get: vi.fn(), update: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getMyTeamProfile: m.get,
  updateMyTeamProfile: m.update,
}))

import { GET, PATCH } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request) => Promise<Response>
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"))
const patch = (body: unknown) =>
  (PATCH as unknown as Handler)(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }))
const card = { name: "N", role_title: "Developer", group_label: "Builders", bio: null, photo_url: null, listed: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/team/profile", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })

  it("returns my card", async () => {
    m.get.mockResolvedValue(card)
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(card)
    expect(m.get).toHaveBeenCalledWith("tok")
  })

  it("passes xvm-api's 404 through for someone off the team", async () => {
    m.get.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "You are not on the team." })))
    expect((await get()).status).toBe(404)
  })
})

describe("PATCH /api/team/profile", () => {
  it("rejects fields a member may not set, with no API call", async () => {
    for (const body of [{ role_title: "Boss" }, { group_label: "X" }, { sort_order: 0 }, { bio: "x".repeat(1001) }, { listed: null }]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
  })

  it("forwards a bio and listing change", async () => {
    m.update.mockResolvedValue({ ...card, bio: "Hello", listed: false })
    const res = await patch({ bio: "Hello", listed: false })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", { bio: "Hello", listed: false })
  })

  it("lets a member clear their bio", async () => {
    m.update.mockResolvedValue(card)
    expect((await patch({ bio: null })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", { bio: null })
  })
})
