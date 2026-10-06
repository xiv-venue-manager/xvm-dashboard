import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), list: vi.fn(), create: vi.fn() }))

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
  listAnnouncements: m.list,
  createAnnouncement: m.create,
}))

import { GET, POST } from "./route"
import { XvmApiError, type AnnouncementRow } from "@/lib/api/xvm-api"

type Handler = (req: Request) => Promise<Response>
const row = (over: Partial<AnnouncementRow> = {}): AnnouncementRow => ({
  id: 5,
  title: "Maintenance",
  message: "Back at 11.",
  link: null,
  link_label: null,
  starts_at: "2026-10-06T08:00:00Z",
  expires_at: null,
  created_by_person_id: 1,
  created_at: "2026-10-06T07:00:00Z",
  ...over,
})
const post = (body: unknown) =>
  (POST as unknown as Handler)(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }))
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"))
const valid = { title: "Maintenance", message: "Back at 11.", link: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/admin/announcements", () => {
  it("is 403 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(403)
  })

  it("returns the list in the shape the admin page reads", async () => {
    m.list.mockResolvedValue([row()])
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      {
        id: "5",
        title: "Maintenance",
        message: "Back at 11.",
        link: null,
        linkLabel: null,
        expiresAt: null,
        createdAt: "2026-10-06T07:00:00Z",
      },
    ])
  })

  it("forwards xvm-api's 403 for someone without the platform_admin scope", async () => {
    m.list.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "This action requires the platform_admin scope." })))
    const res = await get()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("platform_admin")
  })
})

describe("POST /api/admin/announcements", () => {
  it("rejects invalid input with 400 and makes no API call", async () => {
    for (const body of [{ ...valid, title: "" }, { ...valid, message: "x".repeat(501) }, { ...valid, link: "not a url" }, { ...valid, expiresAt: "garbage" }]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(m.create).not.toHaveBeenCalled()
  })

  it("creates the announcement, mapping fields and turning the expiry into an ISO instant", async () => {
    m.create.mockResolvedValue(row())
    const res = await post({ ...valid, linkLabel: "Status", expiresAt: "2026-10-20T14:30" })
    expect(res.status).toBe(201)
    const sent = m.create.mock.calls[0][1]
    expect(sent).toMatchObject({ title: "Maintenance", message: "Back at 11.", link: null, link_label: "Status" })
    expect(sent.expires_at).toBe(new Date("2026-10-20T14:30").toISOString())
    expect((await res.json()).id).toBe("5")
  })

  it("sends null for an absent expiry and label", async () => {
    m.create.mockResolvedValue(row())
    await post(valid)
    expect(m.create.mock.calls[0][1]).toMatchObject({ link_label: null, expires_at: null })
  })

  it("forwards an upstream rejection", async () => {
    m.create.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "This action requires the platform_admin scope." })))
    expect((await post(valid)).status).toBe(403)
  })
})
