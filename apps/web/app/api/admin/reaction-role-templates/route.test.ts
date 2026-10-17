import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockUser, mockToken, mockList, mockCreate } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockUser: vi.fn(),
  mockToken: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
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
  listReactionRoleTemplates: mockList,
  createReactionRoleTemplate: mockCreate,
}))

import { GET, POST } from "./route"

const get = () => (GET as unknown as (req: Request) => Promise<Response>)(new Request("http://localhost/api"))

const post = (body: unknown) =>
  (POST as unknown as (req: Request) => Promise<Response>)(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) })
  )

const valid = { name: "Pronouns", title: "Pick your pronouns" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockUser.mockResolvedValue({ isAdmin: true })
  mockToken.mockResolvedValue("tok")
  mockList.mockResolvedValue([])
  mockCreate.mockResolvedValue({ id: 1, ...valid })
})

describe("GET admin/reaction-role-templates", () => {
  it("lists templates with the caller's own token", async () => {
    expect((await get()).status).toBe(200)
    expect(mockList).toHaveBeenCalledWith("tok")
  })

  it("refuses an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it("refuses a signed-in non-admin before calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    expect((await get()).status).toBe(403)
    expect(mockList).not.toHaveBeenCalled()
  })

  it("refuses a user with no xvm-api link before calling xvm-api", async () => {
    mockToken.mockResolvedValue(null)
    expect((await get()).status).toBe(503)
    expect(mockList).not.toHaveBeenCalled()
  })
})

describe("POST admin/reaction-role-templates", () => {
  it("creates a template and answers 201", async () => {
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith("tok", expect.objectContaining(valid))
  })

  it("rejects a body with no name before calling xvm-api", async () => {
    expect((await post({ title: "No name" })).status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("rejects more options than the cap before calling xvm-api", async () => {
    const options = Array.from({ length: 21 }, (_, i) => ({ name: `Role ${i}`, color: 0 }))
    expect((await post({ ...valid, options })).status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("refuses a non-admin before validating or calling xvm-api", async () => {
    mockUser.mockResolvedValue({ isAdmin: false })
    expect((await post(valid)).status).toBe(403)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // The platform_admin scope lives on the xvm-api credential, not on User.isAdmin,
  // so a dashboard admin without it gets a 403 from xvm-api. That must not read as success.
  it("does not answer 2xx when xvm-api refuses the write", async () => {
    mockCreate.mockRejectedValue(new Error("403 platform_admin required"))
    expect((await post(valid)).status).not.toBe(201)
    expect((await post(valid)).status).not.toBe(200)
  })
})
