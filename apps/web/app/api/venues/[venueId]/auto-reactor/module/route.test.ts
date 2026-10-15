import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  setModule: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  setModule: m.setModule,
}))


beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
})

import { PUT } from "./route"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

describe("PUT /api/venues/[venueId]/auto-reactor/module", () => {
  it("switches the auto_reactor module", async () => {
    m.setModule.mockResolvedValue({ module: "auto_reactor", enabled: true })
    const res = await put({ enabled: true })
    expect(await res.json()).toEqual({ module: "auto_reactor", enabled: true })
    expect(m.setModule).toHaveBeenCalledWith("tok", "xv-1", "auto_reactor", true)
  })

  it("refuses a body that is not a boolean", async () => {
    expect((await put({ enabled: "yes" })).status).toBe(400)
    expect(m.setModule).not.toHaveBeenCalled()
  })

  it("refuses a venue the caller is not in without calling xvm-api", async () => {
    m.lookup.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Venue not found" }, { status: 404 }) })
    expect((await put({ enabled: true })).status).toBe(404)
    expect(m.setModule).not.toHaveBeenCalled()
  })
})
