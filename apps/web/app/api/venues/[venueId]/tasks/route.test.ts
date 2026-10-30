import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  listTasks: vi.fn(),
  listPositions: vi.fn(),
  listTaskCategories: vi.fn(),
  listMemberships: vi.fn(),
  createTask: vi.fn(),
  completeTask: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => {
  throw new Error("must not read Prisma")
})
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: vi.fn(),
}))
vi.mock("@/lib/api/xvm-api", () => ({
  listTasks: m.listTasks,
  listPositions: m.listPositions,
  listTaskCategories: m.listTaskCategories,
  listMemberships: m.listMemberships,
  createTask: m.createTask,
  completeTask: m.completeTask,
  updateTask: vi.fn(),
  assignTask: vi.fn(),
  startTask: vi.fn(),
  cancelTask: vi.fn(),
}))
vi.mock("@/lib/discord-webhook", () => {
  throw new Error("must not send a webhook")
})

import { GET, POST } from "./route"
import { GET as GET_ONE, POST as POST_ONE } from "./[taskId]/route"

const taskRow = {
  id: 7,
  title: "Restock the bar",
  description: null,
  priority: 2,
  due_at: null,
  category_id: null,
  assigned_membership_id: null,
  assigned_position_id: null,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  created_at: "2026-10-25T10:00:00Z",
}

const listContext = { params: Promise.resolve({ venueId: "gilded-lily" }) }
const oneContext = (taskId: string) => ({ params: Promise.resolve({ venueId: "gilded-lily", taskId }) })
const request = (body?: unknown) =>
  new NextRequest("http://localhost/x", { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.listTasks.mockResolvedValue([taskRow])
  m.listPositions.mockResolvedValue([])
  m.listTaskCategories.mockResolvedValue([])
  m.listMemberships.mockResolvedValue([])
})

describe("tasks list", () => {
  it("resolves the venue from /me/venues and reads tasks under the xvm-api id", async () => {
    const res = await GET(request(), listContext)
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(m.listTasks).toHaveBeenCalledWith("tok", "ven_1", { includeCompleted: true, includeCancelled: false })
  })

  it("returns the venue lookup refusal untouched", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    const res = await GET(request(), listContext)
    expect(res.status).toBe(404)
    expect(m.listTasks).not.toHaveBeenCalled()
  })

  it("creates a task", async () => {
    m.createTask.mockResolvedValue({ ...taskRow, id: 8 })
    const res = await POST(request({ title: "Polish glasses" }), listContext)
    expect(res.status).toBe(201)
  })
})

describe("single task", () => {
  it("finds the task in the venue's list", async () => {
    const res = await GET_ONE(request(), oneContext("7"))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(7)
  })

  it.each(["0", "0x10", "1e2", "-3", "abc"])("refuses task id %s as not found without asking xvm-api", async (taskId) => {
    const res = await GET_ONE(request(), oneContext(taskId))
    expect(res.status).toBe(404)
    expect(m.listTasks).not.toHaveBeenCalled()
  })

  it("completes a task", async () => {
    m.completeTask.mockResolvedValue({ ...taskRow, completed_at: "2026-10-25T11:00:00Z" })
    const res = await POST_ONE(request({ action: "complete" }), oneContext("7"))
    expect(res.status).toBe(200)
  })
})
