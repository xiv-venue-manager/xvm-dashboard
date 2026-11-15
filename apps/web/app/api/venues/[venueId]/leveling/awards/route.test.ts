import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  resolve: vi.fn(),
  award: vi.fn(),
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
  resolveDiscordPerson: m.resolve,
  grantLevelingXp: m.award,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.resolve.mockResolvedValue({ id: 42, display_name: "Lily" })
  m.award.mockResolvedValue({ granted: true })
})

import { POST } from "./route"

const OK = { discordUserId: "1509616350337962099", displayName: "Lily", amount: 50 }
const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/leveling/awards", () => {
  it("resolves the Discord user to a person, then grants the XP and answers 201", async () => {
    const res = await post({ ...OK, note: "Won the contest" })
    expect(res.status).toBe(201)
    expect(m.resolve).toHaveBeenCalledWith("tok", "xv-1", {
      discord_user_id: "1509616350337962099",
      display_name: "Lily",
    })
    expect(m.award).toHaveBeenCalledWith("tok", "xv-1", { person_id: 42, amount: 50, note: "Won the contest" })
  })

  it("sends no note when none was given and null for a blank one", async () => {
    await post(OK)
    expect(m.award).toHaveBeenLastCalledWith("tok", "xv-1", { person_id: 42, amount: 50 })
    await post({ ...OK, note: " " })
    expect(m.award).toHaveBeenLastCalledWith("tok", "xv-1", { person_id: 42, amount: 50, note: null })
  })

  it("never grants when the person cannot be resolved", async () => {
    m.resolve.mockRejectedValue(new Error("boom"))
    expect((await post(OK)).status).toBeGreaterThanOrEqual(500)
    expect(m.award).not.toHaveBeenCalled()
  })

  it("rejects a zero amount and a non-numeric user", async () => {
    expect((await post({ ...OK, amount: 0 })).status).toBe(400)
    expect((await post({ ...OK, discordUserId: "lily" })).status).toBe(400)
    expect(m.resolve).not.toHaveBeenCalled()
  })
})
