import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), unlink: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  unlinkMyCharacter: m.unlink,
}))

import { DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const del = (id: string) => DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("DELETE /api/user-characters/:id", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await del("4")).status).toBe(401)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await del("4")).status).toBe(503)
  })

  it("is 404 for a non-numeric id without calling the API", async () => {
    expect((await del("abc")).status).toBe(404)
    expect(m.unlink).not.toHaveBeenCalled()
  })

  it("unlinks by numeric id", async () => {
    m.unlink.mockResolvedValue(undefined)
    const res = await del("4")
    expect(res.status).toBe(200)
    expect(m.unlink).toHaveBeenCalledWith("tok", 4)
    expect(await res.json()).toEqual({ success: true })
  })

  it("forwards xvm-api's 404 for a character that is not the caller's", async () => {
    m.unlink.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "No such character." })))
    expect((await del("4")).status).toBe(404)
  })
})
