import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  venueFindUnique: vi.fn(),
  venueCreate: vi.fn(),
  invalidate: vi.fn(),
  postNewVenue: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFindUnique, create: m.venueCreate } } }))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidate,
  getOrSet: vi.fn(),
  cacheKeys: { userVenues: (id: string) => `user:${id}:venues` },
  cacheTTL: { venue: 300 },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ createVenue: m.createVenue, updateVenue: m.updateVenue }))
vi.mock("@/lib/discord-feed", () => ({ postNewVenue: m.postNewVenue }))
vi.mock("@/lib/email", () => ({ sendEmail: m.sendEmail }))
vi.mock("@/lib/email-templates", () => ({ venueWelcomeEmail: () => ({}), newVenueAlertEmail: () => ({}) }))

import { POST } from "@/app/api/venues/route"

const valid = {
  name: "The Velvet Lotus",
  slug: "velvet-lotus",
  description: "Cocktails and dancing",
  dataCenter: "Crystal",
  world: "Balmung",
  district: "Mist",
  ward: 12,
  plot: 7,
}

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1", email: "owner@example.test", name: "Owner" } })
  m.venueFindUnique.mockResolvedValue(null)
  m.token.mockResolvedValue("tok")
  m.createVenue.mockResolvedValue({ id: "ven_1", name: "The Velvet Lotus", slug: "velvet-lotus", data_center: "Crystal", world: "Balmung" })
  m.updateVenue.mockResolvedValue({})
  m.venueCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", ...data }))
  m.sendEmail.mockResolvedValue(undefined)
})

describe("POST /api/venues address", () => {
  it.each([
    ["no district", { ...valid, district: undefined }],
    ["a district that is not one of the five", { ...valid, district: "The Lavender Beds" }],
    ["no ward", { ...valid, ward: undefined }],
    ["neither a plot nor an apartment", { ...valid, plot: undefined }],
    ["an apartment without main or subdivision", { ...valid, plot: undefined, apartment: 14 }],
  ])("rejects %s before creating anything", async (_name, body) => {
    expect((await post(body)).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("saves an apartment address with its building", async () => {
    const res = await post({ ...valid, plot: undefined, apartment: 14, subdivision: true })
    expect(res.status).toBe(201)
    expect(m.updateVenue).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      expect.objectContaining({ district: "Mist", ward: 12, room: 14, subdivision: true })
    )
  })
})

describe("POST /api/venues", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(401)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("rejects invalid input before calling anything", async () => {
    expect((await post({ ...valid, name: "" })).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("rejects a slug longer than xvm-api accepts", async () => {
    expect((await post({ ...valid, slug: "a".repeat(51) })).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("refuses a slug the bridge table already has, before touching xvm-api", async () => {
    m.venueFindUnique.mockResolvedValue({ id: "existing" })
    expect((await post(valid)).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("answers 503 and creates nothing when there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(503)
    expect(m.createVenue).not.toHaveBeenCalled()
    expect(m.venueCreate).not.toHaveBeenCalled()
  })

  it("creates the venue in xvm-api first and writes only a bridge row to Prisma", async () => {
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.createVenue).toHaveBeenCalledWith("tok", {
      name: "The Velvet Lotus",
      slug: "velvet-lotus",
      data_center: "Crystal",
      world: "Balmung",
    })
    const { data } = m.venueCreate.mock.calls[0][0]
    expect(data).toMatchObject({ slug: "velvet-lotus", ownerId: "u1", xvmApiVenueId: "ven_1", xvmApiVenueLinkedBy: "u1" })
    expect(data.xvmApiVenueLinkedAt).toBeInstanceOf(Date)
    expect(data).not.toHaveProperty("memberships")
    expect(await res.json()).toMatchObject({ slug: "velvet-lotus", profileSaved: true })
  })

  it("sends the profile fields xvm-api's create call does not take", async () => {
    await post(valid)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "ven_1", {
      description: "Cocktails and dancing",
      district: "Mist",
      ward: 12,
      plot: 7,
    })
  })

  it("maps the dashboard's apartment number to xvm-api's room, never to its apartment", async () => {
    await post({ ...valid, plot: undefined, apartment: 3, subdivision: false })
    const [, , update] = m.updateVenue.mock.calls[0]
    expect(update).toMatchObject({ room: 3 })
    expect(update).not.toHaveProperty("apartment")
    expect(update).not.toHaveProperty("plot")
  })

  it("still creates the bridge row, and says the profile was not saved, when that call fails", async () => {
    m.updateVenue.mockRejectedValue(new Error("down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.venueCreate).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ profileSaved: false })
  })

  it("forwards xvm-api's refusal and writes nothing to Prisma", async () => {
    m.createVenue.mockRejectedValue(new Error("slug taken"))
    m.errorResponse.mockResolvedValue(NextResponse.json({ error: "A venue with this slug already exists." }, { status: 409 }))
    const res = await post(valid)
    expect(res.status).toBe(409)
    expect(m.venueCreate).not.toHaveBeenCalled()
  })

  it("logs the orphaned xvm-api venue and answers 500 when the bridge row cannot be written", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    m.venueCreate.mockRejectedValue(new Error("unique violation"))
    expect((await post(valid)).status).toBe(500)
    expect(log.mock.calls.some((call) => String(call[0]).includes("orphaned xvm-api venue ven_1"))).toBe(true)
  })

  it("refreshes the person's venue list and fires the Discord feed", async () => {
    await post(valid)
    expect(m.invalidate).toHaveBeenCalledWith("user:u1:venues")
    expect(m.postNewVenue).toHaveBeenCalled()
  })
})
