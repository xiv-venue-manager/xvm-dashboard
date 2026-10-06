import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), dismiss: vi.fn() }))

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
  dismissAnnouncement: m.dismiss,
}))

import { POST } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const dismiss = (id: string) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("POST /api/announcements/[id]/dismiss", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await dismiss("5")).status).toBe(401)
  })

  it("treats a non-numeric id as not found without calling xvm-api", async () => {
    expect((await dismiss("cm1abc")).status).toBe(404)
    expect(m.dismiss).not.toHaveBeenCalled()
  })

  it("dismisses by numeric id", async () => {
    m.dismiss.mockResolvedValue(null)
    const res = await dismiss("5")
    expect(m.dismiss).toHaveBeenCalledWith("tok", 5)
    expect(await res.json()).toEqual({ success: true })
  })

  it("forwards xvm-api's 404 for an unknown announcement", async () => {
    m.dismiss.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "No such announcement." })))
    expect((await dismiss("5")).status).toBe(404)
  })
})
