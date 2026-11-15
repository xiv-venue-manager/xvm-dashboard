import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  add: vi.fn(),
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
  addProfileGalleryImage: m.add,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.add.mockResolvedValue({ id: 8 })
})

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", profileId: "5" }) }

describe("POST /api/venues/[venueId]/profiles/[profileId]/images", () => {
  it("adds the uploaded file to the gallery and answers 201", async () => {
    const body = new FormData()
    body.append("file", new File(["x"], "i.png", { type: "image/png" }))
    const res = await POST(new Request("http://localhost/api", { method: "POST", body }) as never, context as never)
    expect(res.status).toBe(201)
    expect(m.add).toHaveBeenCalledWith("tok", "xv-1", 5, expect.any(File))
  })

  it("answers 400 with no file", async () => {
    const res = await POST(new Request("http://localhost/api", { method: "POST", body: new FormData() }) as never, context as never)
    expect(res.status).toBe(400)
    expect(m.add).not.toHaveBeenCalled()
  })
})
