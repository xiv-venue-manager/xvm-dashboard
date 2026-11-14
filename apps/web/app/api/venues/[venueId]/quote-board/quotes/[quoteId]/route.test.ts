import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
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
  deleteQuote: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
})

import { DELETE } from "./route"

const context = (quoteId: string) => ({ params: Promise.resolve({ venueId: "vn_1", quoteId }) })
const del = (quoteId: string) =>
  DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context(quoteId) as never)

describe("DELETE /api/venues/[venueId]/quote-board/quotes/[quoteId]", () => {
  it("removes the quote", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await del("12")
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 12)
  })

  it("rejects an id that is not a whole number", async () => {
    for (const quoteId of ["abc", "1.5", ""]) {
      expect((await del(quoteId)).status).toBe(400)
    }
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await del("12")).status).toBe(401)
  })
})
