import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  getMe: vi.fn(),
  errorResponse: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => {
  throw new Error("the admin gate must not read Prisma")
})
vi.mock("@/lib/api/xvm-api", () => ({ getMe: m.getMe }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: m.errorResponse,
}))

import { requirePlatformAdmin } from "./admin-access"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.getMe.mockResolvedValue({ scopes: ["platform_admin"] })
  m.errorResponse.mockResolvedValue(new Response(null, { status: 503 }))
})

describe("requirePlatformAdmin", () => {
  it("is 401 signed out, before asking xvm-api anything", async () => {
    m.session.mockResolvedValue(null)
    const gate = await requirePlatformAdmin()
    expect(gate.error?.status).toBe(401)
    expect(m.getMe).not.toHaveBeenCalled()
  })

  it("is 503 without an xvm-api credential, since the scope cannot be checked", async () => {
    m.token.mockResolvedValue(null)
    const gate = await requirePlatformAdmin()
    expect(gate.error?.status).toBe(503)
    expect(m.getMe).not.toHaveBeenCalled()
  })

  it("lets through a caller whose credential carries platform_admin, handing back their token", async () => {
    const gate = await requirePlatformAdmin()
    expect(gate).toEqual({ error: null, userId: "user-1", token: "tok" })
    expect(m.getMe).toHaveBeenCalledWith("tok")
  })

  it("refuses a caller without the scope, naming itself as the refuser", async () => {
    m.getMe.mockResolvedValue({ scopes: [] })
    const gate = await requirePlatformAdmin()
    expect(gate.error?.status).toBe(403)
    expect((await gate.error?.json()).error).toBe("not_admin")
  })

  it("hands an xvm-api failure to the shared error handler instead of refusing the caller", async () => {
    const err = new Error("down")
    m.getMe.mockRejectedValue(err)
    const gate = await requirePlatformAdmin()
    expect(gate.error?.status).toBe(503)
    expect(m.errorResponse).toHaveBeenCalledWith(err, "user-1", "[admin access] /me read error")
  })
})
