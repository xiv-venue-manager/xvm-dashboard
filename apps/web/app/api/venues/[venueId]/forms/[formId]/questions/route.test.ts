import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  create: vi.fn(),
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
  createFormQuestion: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.create.mockResolvedValue({ id: 9 })
})

import { POST } from "./route"

const context = (formId = "4") => ({ params: Promise.resolve({ venueId: "vn_1", formId }) })
const post = (body: unknown, formId?: string) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context(formId) as never)

describe("POST /api/venues/[venueId]/forms/[formId]/questions", () => {
  it("adds a question under xvm-api's names and answers 201", async () => {
    const res = await post({ prompt: "Why us?", questionType: "long_text", required: false })
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", 4, { prompt: "Why us?", question_type: "long_text", required: false })
  })

  it("leaves the type and required switch to xvm-api's defaults", async () => {
    await post({ prompt: "Name?" })
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", 4, { prompt: "Name?" })
  })

  it("rejects a blank or 81-character prompt and a bad form id", async () => {
    expect((await post({ prompt: " " })).status).toBe(400)
    expect((await post({ prompt: "x".repeat(81) })).status).toBe(400)
    expect((await post({ prompt: "Name?" }, "0")).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
