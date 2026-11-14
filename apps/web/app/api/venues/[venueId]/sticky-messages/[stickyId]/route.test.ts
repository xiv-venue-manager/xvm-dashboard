import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  updateSticky: m.update,
  deleteSticky: m.remove,
}))

import { PATCH, DELETE } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 4 })
  m.remove.mockResolvedValue(undefined)
})

const context = (stickyId: string) => ({ params: Promise.resolve({ venueId: "vn_1", stickyId }) })
const patch = (body: unknown, stickyId = "4") =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(stickyId) as never)
const del = (stickyId: string) =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context(stickyId) as never)

describe("PATCH /api/venues/[venueId]/sticky-messages/[stickyId]", () => {
  it("passes only the fields sent, keeping an explicit null", async () => {
    expect((await patch({ enabled: false, title: null })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, { enabled: false, title: null })
  })

  it("rejects a bad body or an id that is not a whole number", async () => {
    expect((await patch({ title: "x".repeat(257) })).status).toBe(400)
    for (const stickyId of ["abc", "1.5", "0"]) {
      expect((await patch({ enabled: true }, stickyId)).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/sticky-messages/[stickyId]", () => {
  it("removes the sticky", async () => {
    const res = await del("4")
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 4)
  })

  it("rejects an id that is not a whole number", async () => {
    expect((await del("abc")).status).toBe(400)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await del("4")).status).toBe(401)
  })
})
