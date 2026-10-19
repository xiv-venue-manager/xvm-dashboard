import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), triage: vi.fn() }))

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
  triageFeedback: m.triage,
}))

import { PATCH } from "./route"
import { XvmApiError, type AdminFeedbackRow } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ feedbackId: string }> }) => Promise<Response>
const row = (over: Partial<AdminFeedbackRow> = {}): AdminFeedbackRow => ({
  id: 4,
  person_id: 3,
  category: "bug_report",
  status: "planned",
  subject: "Broken button",
  description: "It does nothing when clicked.",
  url: null,
  user_agent: null,
  screenshot_url: null,
  admin_notes: "Scheduled",
  reviewed_by_person_id: 9,
  reviewed_at: "2026-10-07T10:00:00Z",
  created_at: "2026-10-07T09:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
  person_display_name: "Test Person",
  reviewed_by_display_name: "Test Admin",
  ...over,
})
const patch = (id: string, body: unknown) =>
  (PATCH as unknown as Handler)(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ feedbackId: id }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("PATCH /api/admin/feedback/:feedbackId", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await patch("4", { status: "PLANNED" })).status).toBe(401)
    expect(m.triage).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await patch("4", { status: "PLANNED" })).status).toBe(503)
  })

  it("is 404 for a non-numeric id without calling the API", async () => {
    expect((await patch("cm1abc", { status: "PLANNED" })).status).toBe(404)
    expect(m.triage).not.toHaveBeenCalled()
  })

  it("rejects an unknown status with 400", async () => {
    expect((await patch("4", { status: "ARCHIVED" })).status).toBe(400)
    expect(m.triage).not.toHaveBeenCalled()
  })

  it("sends xvm-api a lower-case status and the notes, and returns the named row", async () => {
    m.triage.mockResolvedValue(row())
    const res = await patch("4", { status: "PLANNED", adminNotes: "Scheduled" })
    expect(res.status).toBe(200)
    expect(m.triage).toHaveBeenCalledWith("tok", 4, { status: "planned", admin_notes: "Scheduled" })
    const body = await res.json()
    expect(body).toMatchObject({ id: "4", status: "PLANNED", adminNotes: "Scheduled" })
    expect(body.reviewer).toEqual({ id: "9", displayName: "Test Admin" })
  })

  it("leaves the status out when only notes change", async () => {
    m.triage.mockResolvedValue(row())
    await patch("4", { adminNotes: "Scheduled" })
    expect(m.triage).toHaveBeenCalledWith("tok", 4, { status: undefined, admin_notes: "Scheduled" })
  })

  it("forwards xvm-api's 404 and 403", async () => {
    m.triage.mockRejectedValueOnce(new XvmApiError(404, JSON.stringify({ detail: "No such feedback." })))
    expect((await patch("4", { status: "PLANNED" })).status).toBe(404)
    m.triage.mockRejectedValueOnce(new XvmApiError(403, JSON.stringify({ detail: "Platform admin only." })))
    expect((await patch("4", { status: "PLANNED" })).status).toBe(403)
  })
})
