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
const get = () => GET(new Request("http://localhost/api") as never, context as never)
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context as never)

const detail = {
  tagline: "Cocktails nightly",
  tags: ["Bar", "Music"],
  is_adult: true,
  venue_type: null,
  task_visibility: "all",
  sales_visibility: "all",
  revenue_visibility: "all",
  event_visibility: "all",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.role.mockResolvedValue({ ok: true, venue: { id: "xv-1", role: "OWNER" } })
  m.venueFind.mockResolvedValue({ id: "vn_1", settings: {}, venueType: null })
  m.token.mockResolvedValue("tok")
  m.getVenue.mockResolvedValue(detail)
  m.updateVenue.mockResolvedValue(detail)
})

describe("PUT /api/venues/[venueId]/settings", () => {
  it("saves to xvm-api and writes nothing to Prisma", async () => {
    const res = await put({ tagline: "Cocktails nightly" })
    expect(res.status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "xv-1", { tagline: "Cocktails nightly" })
    expect(m.venueUpdate).not.toHaveBeenCalled()
    expect(m.venueFind).not.toHaveBeenCalled()
  })

  it("resolves the venue through the person's xvm-api venues", async () => {
    await put({ tagline: "Cocktails nightly" })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", "STAFF", expect.any(String), expect.any(String))
  })

  it("sends the tagline, tags and adult flag, and a blank tagline clears it", async () => {
    await put({ tagline: "  Cocktails nightly ", tags: ["Bar", "Music"], isAdult: true })
    expect(m.updateVenue).toHaveBeenLastCalledWith("tok", "xv-1", {
      tagline: "Cocktails nightly",
      tags: ["Bar", "Music"],
      is_adult: true,
    })
    await put({ tagline: "   " })
    expect(m.updateVenue).toHaveBeenLastCalledWith("tok", "xv-1", { tagline: null })
  })

  it("answers with the values xvm-api now holds", async () => {
    const body = await (await put({ tagline: "Cocktails nightly" })).json()
    expect(body.tagline).toBe("Cocktails nightly")
    expect(body.tags).toEqual(["Bar", "Music"])
    expect(body.isAdult).toBe(true)
  })

  it("accepts a PUT from an older page that still carries hours, nights and webhook fields, and ignores them", async () => {
    const res = await put({
      tagline: "Cocktails nightly",
      defaultHours: "10PM",
      openNights: "Fri",
      webhooks: { saleLogged: false },
      discordWebhooks: { staff: "https://discord.com/api/webhooks/2/b" },
      discordWebhookUrl: "https://discord.com/api/webhooks/3/c",
      roomManagerRoleIds: ["role-1"],
    })
    expect(res.status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "xv-1", { tagline: "Cocktails nightly" })
    expect(m.venueUpdate).not.toHaveBeenCalled()
    const body = await res.json()
    for (const key of ["defaultHours", "openNights", "webhooks", "discordWebhooks", "discordWebhookUrl", "roomManagerRoleIds"]) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it("is 503 when there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    const res = await put({ tagline: "Cocktails nightly" })
    expect(res.status).toBe(503)
    expect(m.updateVenue).not.toHaveBeenCalled()
  })

  it("leaves xvm-api alone when the body carries nothing it stores", async () => {
    const res = await put({ defaultHours: "10PM" })
    expect(res.status).toBe(200)
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

describe("GET /api/venues/[venueId]/settings", () => {
  const stored = {
    ...getDefaultVenueSettings(),
    tagline: "Stale",
    tags: ["Old"],
    isAdult: false,
    webhooks: { saleLogged: true },
    discordWebhooks: { staff: "https://discord.com/api/webhooks/1/a", events: "", revenue: "" },
  }

  beforeEach(() => {
    m.venueFind.mockResolvedValue({ settings: stored, venueType: null })
  })

  it("serves xvm-api's tagline, tags and adult flag over the stale ones in Prisma's JSON", async () => {
    const body = await (await get()).json()
    expect(body.tagline).toBe("Cocktails nightly")
    expect(body.tags).toEqual(["Bar", "Music"])
    expect(body.isAdult).toBe(true)
  })

  it("serves an empty string, not null, for a venue with no tagline, so the page can send it back", async () => {
    m.getVenue.mockResolvedValue({ ...detail, tagline: null })
    expect((await (await get()).json()).tagline).toBe("")
  })

  it("omits all three when xvm-api cannot be reached, rather than serving the stale copy", async () => {
    m.token.mockResolvedValue(null)
    const body = await (await get()).json()
    expect(body).not.toHaveProperty("tagline")
    expect(body).not.toHaveProperty("tags")
    expect(body).not.toHaveProperty("isAdult")
  })

  it("does not return a discordWebhookUrl", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty("discordWebhookUrl")
    expect(m.venueFind.mock.calls[0][0].select).not.toHaveProperty("discordWebhookUrl")
  })

  it("serves no stored webhook address", async () => {
    const body = await (await get()).json()
    expect(body).not.toHaveProperty("discordWebhooks")
    expect(body).not.toHaveProperty("webhooks")
  })

  it("looks the settings row up by the xvm-api venue id, and is 404 without one", async () => {
    await get()
    expect(m.venueFind).toHaveBeenCalledWith(expect.objectContaining({ where: { xvmApiVenueId: "xv-1" } }))
    m.venueFind.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })
})
