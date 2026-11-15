import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
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
  setFormThumbnail: m.set,
  clearFormThumbnail: m.clear,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.set.mockResolvedValue({ id: 4 })
  m.clear.mockResolvedValue(undefined)
})

import { PUT, DELETE } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", formId: "4" }) }

describe("/api/venues/[venueId]/forms/[formId]/thumbnail", () => {
  it("passes the uploaded file on", async () => {
    const body = new FormData()
    body.append("file", new File(["x"], "t.png", { type: "image/png" }))
    const res = await PUT(new Request("http://localhost/api", { method: "PUT", body }) as never, context as never)
    expect(res.status).toBe(200)
    expect(m.set).toHaveBeenCalledWith("tok", "xv-1", 4, expect.any(File))
  })

  it("answers 400 when no file came with the request", async () => {
    const res = await PUT(new Request("http://localhost/api", { method: "PUT", body: new FormData() }) as never, context as never)
    expect(res.status).toBe(400)
    expect(m.set).not.toHaveBeenCalled()
  })

  it("clears the thumbnail and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context as never)
    expect(res.status).toBe(204)
    expect(m.clear).toHaveBeenCalledWith("tok", "xv-1", 4)
  })
})
