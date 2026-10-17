import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockUser, mockToken, mockAdd } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockUser: vi.fn(),
  mockToken: vi.fn(),
  mockAdd: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mockUser } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: () => new Response(null, { status: 503 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ addReactionRoleTemplateOption: mockAdd }))

import { POST } from "./route"

type Ctx = { params: Promise<{ templateId: string }> }

const post = (templateId: string, body: unknown) =>
  (POST as unknown as (req: Request, ctx: Ctx) => Promise<Response>)(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ templateId }) }
  )

const option = { name: "They/Them", color: 0x5865f2, emoji: "🏳️‍🌈" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockUser.mockResolvedValue({ isAdmin: true })
  mockToken.mockResolvedValue("tok")
  mockAdd.mockResolvedValue({ id: 3, ...option })
})

describe("POST admin/reaction-role-templates/[templateId]/options", () => {
  it("adds an option and answers 201", async () => {
    const res = await post("7", option)
    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledWith("tok", 7, option)
  })

  it("passes the template id through as a number, not the path string", async () => {
    await post("7", option)
    expect(mockAdd).toHaveBeenCalledWith("tok", 7, expect.anything())
  })

  it("rejects a body with no name before calling xvm-api", async () => {
    const res = await post("7", { color: 0, emoji: null })
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("rejects an over-long role name before calling xvm-api", async () => {
    const res = await post("7", { ...option, name: "x".repeat(101) })
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("rejects a colour outside Discord's range before calling xvm-api", async () => {
    const res = await post("7", { ...option, color: 0x1000000 })
    expect(res.status).toBe(400)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric template id before calling xvm-api", async () => {
    const res = await post("abc", option)
    expect(res.status).toBe(404)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("rejects a template id that is not a positive number", async () => {
    // Number.isInteger alone admits 0 and negatives, and xvm-api ids start at 1, so an id
    // this route cannot possibly find should not cost a round trip to learn that.
    for (const id of ["0", "-5"]) {
      const res = await post(id, option)
      expect(res.status).toBe(404)
    }
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before validating or calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    const res = await post("7", { name: "" })
    expect(res.status).toBe(403)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    const res = await post("7", option)
    expect(res.status).toBe(401)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("refuses a user with no xvm-api link before calling xvm-api", async () => {
    mockToken.mockResolvedValue(null)
    const res = await post("7", option)
    expect(res.status).toBe(503)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("does not answer 2xx when xvm-api refuses the write", async () => {
    mockAdd.mockRejectedValue(new Error("nope"))
    const res = await post("7", option)
    expect(res.status).toBe(503)
  })
})
