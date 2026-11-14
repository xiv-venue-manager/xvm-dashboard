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
  updateEmbed: m.update,
  deleteEmbed: m.remove,
}))

import { draftToBody, emptyDraft } from "@/lib/embed-draft"
import { PATCH, DELETE } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 4 })
  m.remove.mockResolvedValue(undefined)
})

const context = (embedId: string) => ({ params: Promise.resolve({ venueId: "vn_1", embedId }) })
const valid = draftToBody({ ...emptyDraft, name: "Welcome", title: "Hello" })
const patch = (body: unknown, embedId = "4") =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(embedId) as never)
const del = (embedId: string) =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context(embedId) as never)

describe("PATCH /api/venues/[venueId]/embeds/[embedId]", () => {
  it("saves the whole embed, sending null for a cleared field", async () => {
    expect((await patch(valid)).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, expect.objectContaining({ title: "Hello", description: null }))
  })

  it("rejects a bad body or an id that is not a whole number", async () => {
    expect((await patch({ ...valid, name: "" })).status).toBe(400)
    for (const embedId of ["abc", "1.5", "0"]) {
      expect((await patch(valid, embedId)).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/embeds/[embedId]", () => {
  it("removes the embed", async () => {
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
