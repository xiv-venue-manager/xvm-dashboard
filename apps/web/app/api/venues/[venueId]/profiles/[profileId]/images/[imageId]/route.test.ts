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
  updateProfileGalleryImage: m.update,
  deleteProfileGalleryImage: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 8 })
  m.remove.mockResolvedValue(undefined)
})

import { PATCH, DELETE } from "./route"

const context = (imageId = "8") => ({ params: Promise.resolve({ venueId: "vn_1", profileId: "5", imageId }) })
const patch = (body: unknown, imageId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(imageId) as never)

describe("PATCH /api/venues/[venueId]/profiles/[profileId]/images/[imageId]", () => {
  it("maps the caption and a zero sort order", async () => {
    await patch({ caption: "At the bar", sortOrder: 0 })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, 8, { caption: "At the bar", sort_order: 0 })
  })

  it("clears a caption with a blank", async () => {
    await patch({ caption: " " })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, 8, { caption: null })
  })

  it("rejects an empty body, a 51-character caption and a bad id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ caption: "x".repeat(51) })).status).toBe(400)
    expect((await patch({ caption: "a" }, "abc")).status).toBe(400)
  })
})

describe("DELETE /api/venues/[venueId]/profiles/[profileId]/images/[imageId]", () => {
  it("deletes the image and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 5, 8)
  })
})
