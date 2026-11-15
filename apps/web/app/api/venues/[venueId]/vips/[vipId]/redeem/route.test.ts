import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  redeem: vi.fn(),
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
  redeemVipPerk: m.redeem,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.redeem.mockResolvedValue({ id: 11 })
})

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", vipId: "7" }) }
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/vips/[vipId]/redeem", () => {
  it("redeems a perk with a note and answers 201", async () => {
    expect((await post({ perkId: 4, note: "Table 2" })).status).toBe(201)
    expect(m.redeem).toHaveBeenCalledWith("tok", "xv-1", 7, { perk_id: 4, note: "Table 2" })
  })

  it("sends no note when none was given and clears a blank one", async () => {
    await post({ perkId: 4 })
    expect(m.redeem).toHaveBeenLastCalledWith("tok", "xv-1", 7, { perk_id: 4 })
    await post({ perkId: 4, note: " " })
    expect(m.redeem).toHaveBeenLastCalledWith("tok", "xv-1", 7, { perk_id: 4, note: null })
  })

  it("rejects a missing perk and a 201-character note", async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ perkId: 4, note: "x".repeat(201) })).status).toBe(400)
  })
})
