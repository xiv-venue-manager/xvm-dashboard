import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockUser, mockToken, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockUser: vi.fn(),
  mockToken: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mockUser } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: () => new Response(null, { status: 503 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  updateReactionRoleTemplate: mockUpdate,
  deleteReactionRoleTemplate: mockDelete,
}))

import { DELETE, PATCH } from "./route"

type Ctx = { params: Promise<{ templateId: string }> }

const patch = (templateId: string, body: unknown) =>
  (PATCH as unknown as (req: Request, ctx: Ctx) => Promise<Response>)(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ templateId }) }
  )

const del = (templateId: string) =>
  (DELETE as unknown as (req: Request, ctx: Ctx) => Promise<Response>)(
    new Request("http://localhost/api", { method: "DELETE" }),
    { params: Promise.resolve({ templateId }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockUser.mockResolvedValue({ isAdmin: true })
  mockToken.mockResolvedValue("tok")
  mockUpdate.mockResolvedValue({ id: 7, name: "Pronouns" })
  mockDelete.mockResolvedValue(undefined)
})

describe("PATCH admin/reaction-role-templates/[templateId]", () => {
  it("passes the id through as a number, not the path string", async () => {
    expect((await patch("7", { title: "New title" })).status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith("tok", 7, { title: "New title" })
  })

  it("accepts a partial body, so a card can send only what it changed", async () => {
    await patch("7", { description: null })
    expect(mockUpdate).toHaveBeenCalledWith("tok", 7, { description: null })
  })

  it("rejects a non-numeric id before calling xvm-api", async () => {
    expect((await patch("not-a-number", { title: "x" })).status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects an over-long title before calling xvm-api", async () => {
    expect((await patch("7", { title: "x".repeat(101) })).status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    expect((await patch("7", { title: "x" })).status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("does not answer 2xx when xvm-api refuses the write", async () => {
    mockUpdate.mockRejectedValue(new Error("403 platform_admin required"))
    expect((await patch("7", { title: "x" })).status).not.toBe(200)
  })
})

describe("DELETE admin/reaction-role-templates/[templateId]", () => {
  it("deletes and answers 204 with no body", async () => {
    const res = await del("7")
    expect(res.status).toBe(204)
    expect(mockDelete).toHaveBeenCalledWith("tok", 7)
  })

  it("rejects a non-numeric id before calling xvm-api", async () => {
    expect((await del("../3")).status).toBe(404)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    expect((await del("7")).status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
