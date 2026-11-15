import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  guild: vi.fn(),
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
vi.mock("@/lib/api/venue-guild", () => ({  }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  updateLevelingRule: m.update,
  deleteLevelingRule: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.update.mockResolvedValue({ id: 7 })
  m.remove.mockResolvedValue(undefined)
})

import { PATCH, DELETE } from "./route"

const context = (ruleId = "7") => ({ params: Promise.resolve({ venueId: "vn_1", ruleId }) })
const patch = (body: unknown, ruleId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(ruleId) as never)

describe("PATCH /api/venues/[venueId]/leveling/rules/[ruleId]", () => {
  it("maps the fields it was given and no others", async () => {
    const res = await patch({ xpAmount: 8, enabled: false })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { xp_amount: 8, enabled: false })
  })

  it("keeps a zero amount and a zero cooldown", async () => {
    await patch({ xpAmount: 0, cooldownSeconds: 0 })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 7, { xp_amount: 0, cooldown_seconds: 0 })
  })

  it("rejects an empty body and a bad rule id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ enabled: true }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/leveling/rules/[ruleId]", () => {
  it("deletes the rule and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("rejects a bad rule id", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context("0") as never)
    expect(res.status).toBe(400)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
