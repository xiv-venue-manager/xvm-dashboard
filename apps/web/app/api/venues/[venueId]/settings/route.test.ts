import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  role: vi.fn(),
  venueFind: vi.fn(),
  venueUpdate: vi.fn(),
  token: vi.fn(),
  getVenue: vi.fn(),
  updateVenue: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFind, update: m.venueUpdate } } }))
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenueRole: m.role }))
vi.mock("@/lib/api/xvm-api", () => ({ getVenue: m.getVenue, updateVenue: m.updateVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
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
    const res = await put({ openNights: "Fri and Sat" })
    expect(res.status).toBe(404)
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("looks the settings row up by the xvm-api venue id", async () => {
    await put({ openNights: "Fri and Sat" })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", "STAFF", expect.any(String), expect.any(String))
    expect(m.venueFind).toHaveBeenCalledWith(expect.objectContaining({ where: { xvmApiVenueId: "xv-1" } }))
    expect(m.venueUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vn_1" } }))
  })
})

describe("venue webhook settings are retired", () => {
  const stored = {
    ...getDefaultVenueSettings(),
    openNights: "Old",
    webhooks: { saleLogged: true },
    discordWebhooks: { staff: "https://discord.com/api/webhooks/1/a", events: "", revenue: "" },
  }

  it("accepts a PUT that still carries webhook fields, drops them, and keeps the stored ones", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    const res = await put({
      openNights: "New",
      webhooks: { saleLogged: false },
      discordWebhooks: { staff: "https://discord.com/api/webhooks/2/b" },
      discordWebhookUrl: "https://discord.com/api/webhooks/3/c",
    })
    expect(res.status).toBe(200)
    const data = m.venueUpdate.mock.calls[0][0].data
    expect(data).not.toHaveProperty("discordWebhookUrl")
    expect(data.settings.openNights).toBe("New")
    expect(data.settings.webhooks).toEqual(stored.webhooks)
    expect(data.settings.discordWebhooks).toEqual(stored.discordWebhooks)
    expect(m.venueUpdate.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("ignores room manager roles from an older page and stores none", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    const res = await put({ openNights: "New", roomManagerRoleIds: ["role-1"] })
    expect(res.status).toBe(200)
    const data = m.venueUpdate.mock.calls[0][0].data
    expect(data.settings.openNights).toBe("New")
    expect(data.settings).not.toHaveProperty("roomManagerRoleIds")
  })

  it("does not return a discordWebhookUrl from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null })
    const res = await GET(new Request("http://localhost/api") as never, context as never)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty("discordWebhookUrl")
    expect(m.venueFind.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("serves no stored webhook address from GET", async () => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null })
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body.openNights).toBe("Old")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })

  it("serves no stored webhook address from PUT", async () => {
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stored, venueType: null })
    m.venueUpdate.mockResolvedValue({ settings: { ...stored, openNights: "New" } })
    const body = await (await put({ openNights: "New" })).json()
    expect(body.openNights).toBe("New")
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })
})

describe("tagline, tags and the adult flag live in xvm-api", () => {
  const detail = { tagline: "Cocktails nightly", tags: ["Bar", "Music"], is_adult: true, venue_type: null, task_visibility: "all" }
  const stale = { ...getDefaultVenueSettings(), tagline: "Stale", tags: ["Old"], isAdult: false }

  beforeEach(() => {
    m.token.mockResolvedValue("tok")
    m.getVenue.mockResolvedValue(detail)
    m.updateVenue.mockResolvedValue(detail)
    m.venueFind.mockResolvedValue({ id: "vn_1", settings: stale, venueType: null })
  })

  it("serves xvm-api's values on GET over the stale ones in Prisma's JSON", async () => {
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body.tagline).toBe("Cocktails nightly")
    expect(body.tags).toEqual(["Bar", "Music"])
    expect(body.isAdult).toBe(true)
  })

  it("serves an empty string, not null, for a venue with no tagline, so the page can send it back", async () => {
    m.getVenue.mockResolvedValue({ ...detail, tagline: null })
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body.tagline).toBe("")
  })

  it("omits all three from GET when xvm-api cannot be reached, rather than serving the stale copy", async () => {
    m.token.mockResolvedValue(null)
    const body = await (await GET(new Request("http://localhost/api") as never, context as never)).json()
    expect(body).not.toHaveProperty("tagline")
    expect(body).not.toHaveProperty("tags")
    expect(body).not.toHaveProperty("isAdult")
  })

  it("sends the three to xvm-api on PUT and stores none of them in Prisma's JSON", async () => {
    const res = await put({ tagline: "  Cocktails nightly ", tags: ["Bar", "Music"], isAdult: true, openNights: "Fri" })
    expect(res.status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "xv-1", { tagline: "Cocktails nightly", tags: ["Bar", "Music"], is_adult: true })
    const { settings } = m.venueUpdate.mock.calls[0][0].data
    expect(settings.openNights).toBe("Fri")
    expect(settings.tagline).toBe("Stale")
    expect(settings.tags).toEqual(["Old"])
    expect(settings.isAdult).toBe(false)
  })

  it("clears the tagline in xvm-api when it is saved blank", async () => {
    await put({ tagline: "   " })
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "xv-1", { tagline: null })
  })

  it("answers PUT with the values xvm-api now holds", async () => {
    const body = await (await put({ tagline: "Cocktails nightly" })).json()
    expect(body.tagline).toBe("Cocktails nightly")
    expect(body.tags).toEqual(["Bar", "Music"])
    expect(body.isAdult).toBe(true)
  })

  it("is 503 and writes nothing to Prisma when there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    const res = await put({ tagline: "Cocktails nightly", openNights: "Fri" })
    expect(res.status).toBe(503)
    expect(m.updateVenue).not.toHaveBeenCalled()
    expect(m.venueUpdate).not.toHaveBeenCalled()
  })

  it("leaves xvm-api alone when only Prisma-stored settings change", async () => {
    await put({ openNights: "Fri" })
    expect(m.updateVenue).not.toHaveBeenCalled()
  })

  it.each([
    ["a duplicate that differs only in case", ["Bar", "bar"]],
    ["an empty tag", ["Bar", ""]],
    ["more than 20 tags", Array.from({ length: 21 }, (_, i) => `t${i}`)],
  ])("rejects %s before calling xvm-api", async (_name, tags) => {
    const res = await put({ tags })
    expect(res.status).toBe(400)
    expect(m.updateVenue).not.toHaveBeenCalled()
  })
})
