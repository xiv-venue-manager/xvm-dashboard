import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  getMe: vi.fn(),
  patchName: vi.fn(),
  errorResponse: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: m.findUser, update: m.updateUser } } }))
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }))
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
  m.findUser.mockResolvedValue({ id: "user-1", settings: { notifications: { dailySummary: true } } })
  m.getMe.mockResolvedValue({ person: { id: 7, display_name: "Xoza" } })
  m.patchName.mockResolvedValue({ id: 7, display_name: "New Name" })
  m.errorResponse.mockResolvedValue(new Response(JSON.stringify({ error: "xvm-api request failed" }), { status: 503 }))
})

describe("GET /api/user/profile", () => {
  it("is 401 signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("is 503 without an xvm-api credential, with no fallback to the Prisma name", async () => {
    m.token.mockResolvedValue(null)
    expect((await GET()).status).toBe(503)
    expect(m.findUser).not.toHaveBeenCalled()
  })

  it("takes the display name from xvm-api and the settings from the user row", async () => {
    const body = await (await GET()).json()
    expect(body).toEqual({ id: "user-1", settings: { notifications: { dailySummary: true } }, displayName: "Xoza" })
  })
})

describe("PATCH /api/user/profile", () => {
  it("saves a display name through xvm-api and writes nothing to Prisma for it", async () => {
    const res = await patch({ displayName: "  New Name  " })
    expect(m.patchName).toHaveBeenCalledWith("tok", "New Name")
    expect(m.updateUser).not.toHaveBeenCalled()
    expect((await res.json()).displayName).toBe("New Name")
  })

  it("rejects a name over 50 characters before calling xvm-api", async () => {
    const res = await patch({ displayName: "x".repeat(51) })
    expect(res.status).toBe(400)
    expect(m.patchName).not.toHaveBeenCalled()
  })

  it("saves notification preferences without needing xvm-api", async () => {
    m.token.mockResolvedValue(null)
    m.updateUser.mockResolvedValue({ settings: { notifications: { dailySummary: false } } })
    const res = await patch({ notifications: { dailySummary: false } })
    expect(res.status).toBe(200)
    expect(m.patchName).not.toHaveBeenCalled()
    expect(m.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: { settings: { notifications: { dailySummary: false } } } })
    )
  })

  it("does not touch settings when the name save fails", async () => {
    m.patchName.mockRejectedValue(new Error("down"))
    const res = await patch({ displayName: "A", notifications: { dailySummary: false } })
    expect(res.status).toBe(503)
    expect(m.updateUser).not.toHaveBeenCalled()
  })

  it("is 503 when a name is being saved and there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await patch({ displayName: "A" })).status).toBe(503)
  })
})
