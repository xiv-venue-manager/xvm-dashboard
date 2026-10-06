import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), remove: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  deleteShout: m.remove,
}))

import { DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const ORIGIN = "https://shout.xivvenuemanager.com"
const del = (id: string) => DELETE(new Request("http://localhost/api") as never, { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("DELETE /api/shout-crafter/shouts/[id]", () => {
  it("is 401 with CORS headers when signed out", async () => {
    m.session.mockResolvedValue(null)
    const res = await del("4")
    expect(res.status).toBe(401)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })

  it("treats a non-numeric id, such as an old cuid, as not found without calling xvm-api", async () => {
    const res = await del("cm1abc")
    expect(res.status).toBe(404)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("deletes by numeric id and returns ok", async () => {
    m.remove.mockResolvedValue(null)
    const res = await del("4")
    expect(m.remove).toHaveBeenCalledWith("tok", 4)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })

  it("forwards xvm-api's 404 for a shout that is not the caller's", async () => {
    m.remove.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "No such shout of yours." })))
    const res = await del("4")
    expect(res.status).toBe(404)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })
})
