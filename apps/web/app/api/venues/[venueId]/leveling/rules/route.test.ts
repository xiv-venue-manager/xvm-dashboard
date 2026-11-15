import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  guild: vi.fn(),
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
vi.mock("@/lib/api/venue-guild", () => ({  }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  createLevelingRule: m.create,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.create.mockResolvedValue({ id: 1 })
})

import { POST } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

describe("POST /api/venues/[venueId]/leveling/rules", () => {
  it("creates a rule under xvm-api's names and answers 201", async () => {
    const res = await post({ sourceKey: "discord.message", xpAmount: 5, cooldownSeconds: 60, enabled: false })
    expect(res.status).toBe(201)
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", {
      source_key: "discord.message",
      xp_amount: 5,
      cooldown_seconds: 60,
      enabled: false,
    })
  })

  it("leaves the cooldown and switch to xvm-api's defaults when not given", async () => {
    await post({ sourceKey: "patron.visit", xpAmount: 10 })
    expect(m.create).toHaveBeenCalledWith("tok", "xv-1", { source_key: "patron.visit", xp_amount: 10 })
  })

  it("refuses the manual source and an out-of-range amount", async () => {
    expect((await post({ sourceKey: "manual", xpAmount: 5 })).status).toBe(400)
    expect((await post({ sourceKey: "discord.message", xpAmount: -1 })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 401 with no session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post({ sourceKey: "discord.message", xpAmount: 5 })).status).toBe(401)
  })
})
