import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  getMe: vi.fn(),
  patchName: vi.fn(),
  errorResponse: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => {
  throw new Error("the profile route must not read Prisma")
})
vi.mock("@/lib/api/xvm-api", () => ({ getMe: m.getMe, updateMyDisplayName: m.patchName }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: m.errorResponse,
}))

import { GET, PATCH } from "./route"

const patch = (body: unknown) =>
  PATCH(new Request("http://x/api/user/profile", { method: "PATCH", body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.getMe.mockResolvedValue({ person: { id: 7, display_name: "Xoza" } })
  m.patchName.mockResolvedValue({ id: 7, display_name: "New Name" })
  m.errorResponse.mockResolvedValue(new Response(JSON.stringify({ error: "xvm-api request failed" }), { status: 503 }))
})

describe("GET /api/user/profile", () => {
  it("is 401 signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("returns a null name without an xvm-api credential, with no fallback to a Prisma name", async () => {
    m.token.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "user-1", displayName: null })
    expect(m.getMe).not.toHaveBeenCalled()
  })

  it("returns a null name when xvm-api fails, and still lets the error handler clear a dead credential", async () => {
    const err = new Error("down")
    m.getMe.mockRejectedValue(err)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "user-1", displayName: null })
    expect(m.errorResponse).toHaveBeenCalledWith(err, "user-1", "[user profile] GET error")
  })

  it("takes the display name from xvm-api", async () => {
    expect(await (await GET()).json()).toEqual({ id: "user-1", displayName: "Xoza" })
  })
})

describe("PATCH /api/user/profile", () => {
  it("is 401 signed out, before calling xvm-api", async () => {
    m.session.mockResolvedValue(null)
    expect((await patch({ displayName: "A" })).status).toBe(401)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("saves a trimmed display name through xvm-api and returns what xvm-api stored", async () => {
    const res = await patch({ displayName: "  New Name  " })
    expect(m.patchName).toHaveBeenCalledWith("tok", "New Name")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "user-1", displayName: "New Name" })
  })

  it("requires a name: a body without one is a 400 and calls nothing", async () => {
    const res = await patch({})
    expect(res.status).toBe(400)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("rejects a blank name before calling xvm-api", async () => {
    expect((await patch({ displayName: "   " })).status).toBe(400)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("rejects a name over 50 characters before calling xvm-api", async () => {
    expect((await patch({ displayName: "x".repeat(51) })).status).toBe(400)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("is 503 without an xvm-api credential and calls nothing", async () => {
    m.token.mockResolvedValue(null)
    expect((await patch({ displayName: "A" })).status).toBe(503)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("hands an xvm-api failure to the shared error handler", async () => {
    const err = new Error("down")
    m.patchName.mockRejectedValue(err)
    const res = await patch({ displayName: "A" })
    expect(res.status).toBe(503)
    expect(m.errorResponse).toHaveBeenCalledWith(err, "user-1", "[user profile] PATCH error")
  })
})
