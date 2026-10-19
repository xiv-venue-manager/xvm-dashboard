import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), lookup: vi.fn(), roll: vi.fn() }))

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
  rollGiveaway: m.roll,
}))

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1", giveawayId: "5" }) }
const roll = (query = "") => POST(new Request(`http://localhost/api${query}`, { method: "POST" }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.roll.mockResolvedValue({ winners: [] })
})

describe("POST .../contests/giveaways/[giveawayId]/roll", () => {
  it("rolls once by default", async () => {
    expect((await roll()).status).toBe(200)
    expect(m.roll).toHaveBeenCalledWith("tok", "xv-1", 5, { reroll: false })
  })

  it("passes reroll=true through to xvm-api", async () => {
    await roll("?reroll=true")
    expect(m.roll).toHaveBeenCalledWith("tok", "xv-1", 5, { reroll: true })
  })

  it("does not treat any other reroll value as a re-roll", async () => {
    await roll("?reroll=1")
    expect(m.roll).toHaveBeenCalledWith("tok", "xv-1", 5, { reroll: false })
  })
})
