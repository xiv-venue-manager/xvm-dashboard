import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  request: vi.fn(),
  errorResponse: vi.fn(),
  userDelete: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { delete: m.userDelete } } }))
vi.mock("@/lib/api/xvm-api", () => ({ requestAccountDeletion: m.request }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: m.errorResponse,
}))

import { DELETE } from "./route"

const call = () => DELETE(new Request("http://x/api/user/deletion", { method: "DELETE" }) as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.request.mockResolvedValue({ requested_at: "2026-10-27T09:00:00Z", anonymises_at: "2026-11-26T09:00:00Z" })
  m.errorResponse.mockResolvedValue(new Response(JSON.stringify({ error: "Unpaid payroll" }), { status: 409 }))
})

describe("DELETE /api/user/deletion", () => {
  it("is 401 signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.request).not.toHaveBeenCalled()
  })

  it("is 503 without a stored xvm-api token, and does not call xvm-api", async () => {
    m.token.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain("scheduled for deletion")
    expect(m.request).not.toHaveBeenCalled()
  })

  it("asks xvm-api and returns the day it is anonymised", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ anonymisesAt: "2026-11-26T09:00:00Z" })
    expect(m.request).toHaveBeenCalledWith("tok")
  })

  it("passes a refusal through the shared error handler", async () => {
    const refusal = new Error("409")
    m.request.mockRejectedValue(refusal)
    const res = await call()
    expect(res.status).toBe(409)
    expect(m.errorResponse).toHaveBeenCalledWith(refusal, "user-1", "[account deletion] request error")
  })

  it("never deletes the Prisma user", async () => {
    await call()
    expect(m.userDelete).not.toHaveBeenCalled()
  })
})
