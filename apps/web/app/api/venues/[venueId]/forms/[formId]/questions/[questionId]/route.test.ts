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
  updateFormQuestion: m.update,
  deleteFormQuestion: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 9 })
  m.remove.mockResolvedValue(undefined)
})

import { PATCH, DELETE } from "./route"

const context = (questionId = "9") => ({ params: Promise.resolve({ venueId: "vn_1", formId: "4", questionId }) })
const patch = (body: unknown, questionId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(questionId) as never)

describe("PATCH /api/venues/[venueId]/forms/[formId]/questions/[questionId]", () => {
  it("maps every field, keeping a zero sort order", async () => {
    const res = await patch({ prompt: "Pick one", questionType: "single_select", required: true, sortOrder: 0, options: ["Yes", "No"] })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, 9, {
      prompt: "Pick one",
      question_type: "single_select",
      required: true,
      sort_order: 0,
      options: ["Yes", "No"],
    })
  })

  it("sends only the fields it was given", async () => {
    await patch({ required: false })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, 9, { required: false })
  })

  it("rejects repeated options, too many options, an empty body and a bad id", async () => {
    expect((await patch({ options: ["A", "a"] })).status).toBe(400)
    expect((await patch({ options: Array.from({ length: 21 }, (_, i) => `o${i}`) })).status).toBe(400)
    expect((await patch({})).status).toBe(400)
    expect((await patch({ required: true }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/forms/[formId]/questions/[questionId]", () => {
  it("deletes the question and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 4, 9)
  })
})
