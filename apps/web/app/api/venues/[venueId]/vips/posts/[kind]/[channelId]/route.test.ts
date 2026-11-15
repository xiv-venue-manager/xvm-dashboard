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
  deleteVipPost: m.remove,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.remove.mockResolvedValue(undefined)
})

import { DELETE } from "./route"

const CHANNEL = "1509616350337962099"
const context = (kind: string, channelId: string) => ({ params: Promise.resolve({ venueId: "vn_1", kind, channelId }) })
const call = (kind: string, channelId: string) => DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context(kind, channelId) as never)

describe("DELETE /api/venues/[venueId]/vips/posts/[kind]/[channelId]", () => {
  it("takes the post down and answers 204", async () => {
    expect((await call("roster", CHANNEL)).status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", "roster", CHANNEL)
  })

  it("rejects an unknown kind and a non-numeric channel", async () => {
    expect((await call("welcome", CHANNEL)).status).toBe(400)
    expect((await call("roster", "general")).status).toBe(400)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
