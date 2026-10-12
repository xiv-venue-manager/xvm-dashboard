import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  updateVenue: vi.fn(),
  venueFindUnique: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFindUnique } } }))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidate,
  cacheKeys: { venue: (id: string) => `venue:${id}`, venueBySlug: (s: string) => `venue:slug:${s}`, userVenues: (id: string) => `user:${id}:venues` },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/venue-access", () => ({ requireVenueRole: vi.fn() }))
vi.mock("@/lib/api/xvm-api", () => ({ updateVenue: m.updateVenue }))

import { PATCH } from "@/app/api/venues/[venueId]/route"

const patch = (body: unknown) =>
  PATCH(
    new NextRequest("http://localhost/api/venues/v1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ venueId: "v1" }) }
  )

const house = { district: "Mist", ward: 12, plot: 7, apartment: null }

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.venueFindUnique.mockResolvedValue({ xvmApiVenueId: "ven_1", slug: "velvet-lotus" })
  m.updateVenue.mockResolvedValue({ id: "ven_1" })
  m.invalidate.mockResolvedValue(undefined)
})

describe("PATCH /api/venues/[venueId] address", () => {
  it("lets a save that sends no address fields through", async () => {
    expect((await patch({ name: "New name" })).status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "ven_1", { name: "New name" })
  })

  it("saves a complete house address", async () => {
    expect((await patch({ name: "New name", ...house })).status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      expect.objectContaining({ district: "Mist", ward: 12, plot: 7 })
    )
  })

  it("saves an apartment with its building", async () => {
    const res = await patch({ district: "Goblet", ward: 3, plot: null, apartment: 14, subdivision: true })
    expect(res.status).toBe(200)
    expect(m.updateVenue).toHaveBeenCalledWith(
      "tok",
      "ven_1",
      expect.objectContaining({ district: "Goblet", ward: 3, room: 14, subdivision: true })
    )
  })

  it.each([
    ["a district that is not one of the five", { ...house, district: "The Lavender Beds" }],
    ["an address with no district", { ...house, district: null }],
    ["an address with no ward", { ...house, ward: null }],
    ["an address with neither plot nor apartment", { ...house, plot: null }],
    ["an apartment that does not say main or subdivision", { district: "Goblet", ward: 3, plot: null, apartment: 14 }],
  ])("rejects %s and writes nothing", async (_name, body) => {
    const res = await patch(body)
    expect(res.status).toBe(400)
    expect(m.updateVenue).not.toHaveBeenCalled()
  })
})
