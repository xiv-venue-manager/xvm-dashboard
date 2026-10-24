import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), list: vi.fn(), markRead: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listMyNotifications: m.list,
  markNotificationsRead: m.markRead,
}))

import { GET, PATCH } from "./route"
import { XvmApiError, type NotificationRow } from "@/lib/api/xvm-api"

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: 12,
  kind: "staff.joined",
  title: "New staff",
  body: "Mira joined The Velvet Chord as staff.",
  link: null,
  read_at: null,
  created_at: "2026-10-24T20:00:00Z",
  venue_id: "ven_1",
  venue_slug: "velvet-chord",
  target_type: null,
  target_id: null,
  ...over,
})
const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.markRead.mockResolvedValue({ updated: 1 })
})

describe("GET /api/notifications", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect(m.list).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await GET()).status).toBe(503)
  })

  it("asks for the latest 30 and returns them in the shape the bell reads, with the whole unread count", async () => {
    m.list.mockResolvedValue({ notifications: [row(), row({ id: 11, read_at: "2026-10-24T19:00:00Z" })], unread_count: 41 })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(m.list).toHaveBeenCalledWith("tok", 30)
    expect(await res.json()).toEqual({
      notifications: [
        {
          id: "12",
          type: "staff.joined",
          title: "New staff",
          body: "Mira joined The Velvet Chord as staff.",
          link: "/dashboard/velvet-chord/staff",
          read: false,
          createdAt: "2026-10-24T20:00:00Z",
        },
        expect.objectContaining({ id: "11", read: true }),
      ],
      unreadCount: 41,
    })
  })

  it("forwards an upstream failure", async () => {
    m.list.mockRejectedValue(new XvmApiError(500, "boom"))
    expect((await GET()).status).toBe(500)
  })
})

describe("PATCH /api/notifications", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await patch({})).status).toBe(401)
    expect(m.markRead).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await patch({})).status).toBe(503)
  })

  it("marks the whole inbox read when no ids are sent", async () => {
    const res = await patch({})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(m.markRead).toHaveBeenCalledWith("tok", undefined)
  })

  it("marks the given ids, which arrive as strings, read as numbers", async () => {
    await patch({ ids: ["12", "11"] })
    expect(m.markRead).toHaveBeenCalledWith("tok", [12, 11])
  })

  it.each([[{ ids: ["abc"] }], [{ ids: [] }], [{ ids: ["-3"] }]])("is 400 for ids that are not positive numbers (%j)", async (body) => {
    expect((await patch(body)).status).toBe(400)
    expect(m.markRead).not.toHaveBeenCalled()
  })

  it("treats an unreadable body as mark everything", async () => {
    const res = await PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: "not json" }))
    expect(res.status).toBe(200)
    expect(m.markRead).toHaveBeenCalledWith("tok", undefined)
  })

  it("forwards an upstream failure", async () => {
    m.markRead.mockRejectedValue(new XvmApiError(422, "bad ids"))
    expect((await patch({ ids: ["1"] })).status).toBe(422)
  })
})
