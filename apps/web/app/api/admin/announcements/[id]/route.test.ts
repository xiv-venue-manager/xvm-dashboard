import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), remove: vi.fn() }))

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
  deleteAnnouncement: m.remove,
}))

import { DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const del = (id: string) =>
  (DELETE as unknown as Handler)(new Request("http://localhost/api"), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("DELETE /api/admin/announcements/[id]", () => {
  it("is 403 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await del("5")).status).toBe(403)
  })

  it("treats a non-numeric id as not found without calling xvm-api", async () => {
    expect((await del("cm1abc")).status).toBe(404)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("deletes by numeric id", async () => {
    m.remove.mockResolvedValue(null)
    const res = await del("5")
    expect(m.remove).toHaveBeenCalledWith("tok", 5)
    expect(await res.json()).toEqual({ success: true })
  })

  it("forwards xvm-api's 404 and 403", async () => {
    m.remove.mockRejectedValueOnce(new XvmApiError(404, JSON.stringify({ detail: "No such announcement." })))
    expect((await del("5")).status).toBe(404)
    m.remove.mockRejectedValueOnce(new XvmApiError(403, JSON.stringify({ detail: "Requires platform_admin." })))
    expect((await del("5")).status).toBe(403)
  })
})
