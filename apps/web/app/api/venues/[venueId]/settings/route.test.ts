import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
  venueFind: vi.fn(),
  venueUpdate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFind, update: m.venueUpdate } } }))
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenueRole: m.role }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: vi.fn(),
  invalidateXvmApiCredential: vi.fn(),
  isXvmAuthFailure: vi.fn(),
  xvmApiErrorResponse: vi.fn(),
}))

import { GET, PUT } from "./route"
import { getDefaultVenueSettings } from "@/lib/types/venue-settings"

const context = { params: Promise.resolve({ venueId: "vn_1" }) }
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.role.mockResolvedValue({ ok: true, venue: { id: "xv-1", role: "OWNER" } })
  m.venueFind.mockResolvedValue({ id: "vn_1", settings: {}, venueType: null })
  m.venueUpdate.mockResolvedValue({ settings: {} })
})

describe("PUT /api/venues/[venueId]/settings", () => {
  it("is 404 when the xvm-api venue has no dashboard settings row, and saves nothing", async () => {
    m.venueFind.mockResolvedValue(null)
    const res = await put({ tagline: "Open nightly" })
    expect(res.status).toBe(404)
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("looks the settings row up by the xvm-api venue id", async () => {
    await put({ tagline: "Open nightly" })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", "STAFF", expect.any(String), expect.any(String))
    expect(m.venueFind).toHaveBeenCalledWith(expect.objectContaining({ where: { xvmApiVenueId: "xv-1" } }))
    expect(m.venueUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vn_1" } }))
  })
})

describe("venue webhook settings are retired", () => {
  const stored = {
    ...getDefaultVenueSettings(),
    tagline: "Old",
    webhooks: { saleLogged: true },
    discordWebhooks: { staff: "https://discord.com/api/webhooks/1/a", events: "", revenue: "" },
  }

  it("accepts a PUT that still carries webhook fields, drops them, and keeps the stored ones", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    const res = await put({
      tagline: "New",
      webhooks: { saleLogged: false },
      discordWebhooks: { staff: "https://discord.com/api/webhooks/2/b" },
      discordWebhookUrl: "https://discord.com/api/webhooks/3/c",
    })
    expect(res.status).toBe(200)
    const data = m.venueUpdate.mock.calls[0][0].data
    expect(data).not.toHaveProperty("discordWebhookUrl")
    expect(data.settings.tagline).toBe("New")
    expect(data.settings.webhooks).toEqual(stored.webhooks)
    expect(data.settings.discordWebhooks).toEqual(stored.discordWebhooks)
    expect(m.venueUpdate.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("does not return a discordWebhookUrl from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null, froggeToken: null })
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty("discordWebhookUrl")
    expect(m.venueFind.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("serves no stored webhook address from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null, froggeToken: null })
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body.tagline).toBe("Old")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })

  it("serves no stored webhook address from PUT", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    m.venueUpdate.mockResolvedValue({ settings: { ...stored, tagline: "New" } })
    const body = await (await put({ tagline: "New" })).json()
    expect(body.tagline).toBe("New")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })
})
