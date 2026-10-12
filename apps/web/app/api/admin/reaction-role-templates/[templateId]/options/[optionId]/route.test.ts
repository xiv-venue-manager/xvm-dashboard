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
  updateReactionRoleTemplateOption: mockUpdate,
  deleteReactionRoleTemplateOption: mockDelete,
}))

import { DELETE, PATCH } from "./route"

type Ctx = { params: Promise<{ templateId: string; optionId: string }> }

const patch = (templateId: string, optionId: string, body: unknown) =>
  (PATCH as unknown as (req: Request, ctx: Ctx) => Promise<Response>)(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ templateId, optionId }) }
  )

const del = (templateId: string, optionId: string) =>
  (DELETE as unknown as (req: Request, ctx: Ctx) => Promise<Response>)(
    new Request("http://localhost/api", { method: "DELETE" }),
    { params: Promise.resolve({ templateId, optionId }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockUser.mockResolvedValue({ isAdmin: true })
  mockToken.mockResolvedValue("tok")
  mockUpdate.mockResolvedValue({ id: 3, name: "They/Them" })
  mockDelete.mockResolvedValue(undefined)
})

describe("PATCH admin/reaction-role-templates/[templateId]/options/[optionId]", () => {
  it("passes both ids through as numbers, not the path strings", async () => {
    await patch("7", "3", { name: "She/Her" })
    expect(mockUpdate).toHaveBeenCalledWith("tok", 7, 3, { name: "She/Her" })
  })

  it("accepts a partial body, so a card can send only what it changed", async () => {
    const res = await patch("7", "3", { color: 0 })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith("tok", 7, 3, { color: 0 })
  })

  it("rejects a non-numeric option id before calling xvm-api", async () => {
    const res = await patch("7", "abc", { name: "She/Her" })
    expect(res.status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric template id before calling xvm-api", async () => {
    const res = await patch("abc", "3", { name: "She/Her" })
    expect(res.status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects ids that are not positive numbers", async () => {
    // Either id. Number.isInteger alone admits 0 and negatives, and xvm-api ids start at 1.
    for (const [template, opt] of [["0", "3"], ["7", "0"], ["-1", "3"], ["7", "-1"]]) {
      const res = await patch(template, opt, { name: "She/Her" })
      expect(res.status).toBe(404)
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects an over-long role name before calling xvm-api", async () => {
    const res = await patch("7", "3", { name: "x".repeat(101) })
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before validating or calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    const res = await patch("7", "3", { name: "x".repeat(101) })
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("does not answer 2xx when xvm-api refuses the write", async () => {
    mockUpdate.mockRejectedValue(new Error("nope"))
    const res = await patch("7", "3", { name: "She/Her" })
    expect(res.status).toBe(503)
  })
})

describe("DELETE admin/reaction-role-templates/[templateId]/options/[optionId]", () => {
  it("deletes and answers 204 with no body", async () => {
    const res = await del("7", "3")
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(mockDelete).toHaveBeenCalledWith("tok", 7, 3)
  })

  it("rejects a non-numeric id before calling xvm-api", async () => {
    const res = await del("7", "abc")
    expect(res.status).toBe(404)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("rejects ids that are not positive numbers", async () => {
    for (const [template, opt] of [["0", "3"], ["7", "0"]]) {
      const res = await del(template, opt)
      expect(res.status).toBe(404)
    }
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    const res = await del("7", "3")
    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    const res = await del("7", "3")
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
