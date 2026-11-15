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
  createVipPerk: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.create.mockResolvedValue({ id: 5 })
})

import { POST } from "./route"

const context = (tierId = "2") => ({ params: Promise.resolve({ venueId: "vn_1", tierId }) })
const post = (body: unknown, tierId?: string) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context(tierId) as never)

describe("POST /api/venues/[venueId]/vips/tiers/[tierId]/perks", () => {
  it("adds a perk under xvm-api's names and answers 201", async () => {
    expect((await post({ name: "Free drink", description: "House wine", repeatability: "weekly", sortOrder: 0 })).status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", 2, { name: "Free drink", description: "House wine", repeatability: "weekly", sort_order: 0 })
  })

  it("rejects an unknown repeat rule, a blank name and a bad tier id", async () => {
    expect((await post({ name: "Drink", repeatability: "daily" })).status).toBe(400)
    expect((await post({ name: " " })).status).toBe(400)
    expect((await post({ name: "Drink" }, "abc")).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })
})
