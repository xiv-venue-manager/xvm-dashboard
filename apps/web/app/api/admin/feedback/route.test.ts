import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), list: vi.fn() }))

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
  listAdminFeedback: m.list,
}))

import { GET } from "./route"
import { XvmApiError, type AdminFeedbackRow } from "@/lib/api/xvm-api"

type Handler = (req: Request) => Promise<Response>
const row = (over: Partial<AdminFeedbackRow> = {}): AdminFeedbackRow => ({
  id: 4,
  person_id: 3,
  category: "bug_report",
  status: "new",
  subject: "Broken button",
  description: "It does nothing when clicked.",
  url: null,
  user_agent: null,
  screenshot_url: null,
  admin_notes: null,
  reviewed_by_person_id: null,
  reviewed_at: null,
  created_at: "2026-10-07T09:00:00Z",
  updated_at: "2026-10-07T09:00:00Z",
  person_display_name: "Test Person",
  reviewed_by_display_name: null,
  ...over,
})
const get = (query = "") =>
  (GET as unknown as Handler)(
    Object.assign(new Request(`http://localhost/api?${query}`), { nextUrl: new URL(`http://localhost/api?${query}`) })
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/admin/feedback", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await get()).status).toBe(503)
  })

  it("rejects an unknown filter with 400 and no API call", async () => {
    expect((await get("status=ARCHIVED")).status).toBe(400)
    expect((await get("category=OTHER")).status).toBe(400)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("sends xvm-api lower-case filters and names the submitter", async () => {
    m.list.mockResolvedValue([row(), row({ id: 5, person_id: 8, person_display_name: null })])
    const res = await get("status=IN_PROGRESS&category=BUG_REPORT")
    expect(res.status).toBe(200)
    expect(m.list).toHaveBeenCalledWith("tok", { status: "in_progress", category: "bug_report" })
    const body = await res.json()
    expect(body[0].user).toEqual({ id: "3", displayName: "Test Person" })
    expect(body[1].user.displayName).toBe("Person #8")
    expect(body[0].reviewer).toBeNull()
  })

  it("passes no filters when none are given", async () => {
    m.list.mockResolvedValue([])
    await get()
    expect(m.list).toHaveBeenCalledWith("tok", { status: undefined, category: undefined })
  })

  it("forwards xvm-api's 403 for someone without platform admin", async () => {
    m.list.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Platform admin only." })))
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("Platform admin")
  })
})
