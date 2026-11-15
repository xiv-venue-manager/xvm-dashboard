import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  resolve: vi.fn(),
  grant: vi.fn(),
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
  grantVip: m.grant,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.resolve.mockResolvedValue({ id: 42, display_name: "Lily" })
  m.grant.mockResolvedValue({ id: 7 })
})

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
import { POST } from "./route"

const OK = { discordUserId: "1509616350337962099", displayName: "Lily", tierId: 2 }
const post = (body: unknown) => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/vips", () => {
  it("resolves the Discord user to a person, then grants the tier and answers 201", async () => {
    const res = await post({ ...OK, expiresAt: "2026-12-24T23:59:59.000Z", notes: "Birthday gift" })
    expect(res.status).toBe(201)
    expect(m.resolve).toHaveBeenCalledWith("tok", "xv-1", { discord_user_id: "1509616350337962099", display_name: "Lily" })
    expect(m.grant).toHaveBeenCalledWith("tok", "xv-1", {
      person_id: 42,
      tier_id: 2,
      expires_at: "2026-12-24T23:59:59.000Z",
      notes: "Birthday gift",
    })
  })

  it("grants a lifetime VIP when no expiry is given", async () => {
    await post(OK)
    expect(m.grant).toHaveBeenCalledWith("tok", "xv-1", { person_id: 42, tier_id: 2 })
  })

  it("never grants when the person cannot be resolved", async () => {
    m.resolve.mockRejectedValue(new Error("boom"))
    expect((await post(OK)).status).toBeGreaterThanOrEqual(500)
    expect(m.grant).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric user, a missing tier and a bad expiry", async () => {
    expect((await post({ ...OK, discordUserId: "lily" })).status).toBe(400)
    expect((await post({ ...OK, tierId: 0 })).status).toBe(400)
    expect((await post({ ...OK, expiresAt: "soon" })).status).toBe(400)
    expect(m.resolve).not.toHaveBeenCalled()
  })
})
