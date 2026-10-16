import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venueFind: vi.fn(),
  upsert: vi.fn(),
  notify: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: { venue: { findFirst: m.venueFind }, venueFollow: { upsert: m.upsert, deleteMany: vi.fn() } },
}))
vi.mock("@/lib/notify", () => ({ notifyVenueOwners: m.notify }))

import { POST } from "./route"

const call = () =>
  POST(new Request("http://localhost/api/venues/cm123/follow", { method: "POST" }), {
    params: Promise.resolve({ venueId: "cm123" }),
  })

describe("POST /api/venues/[venueId]/follow", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.session.mockResolvedValue({ user: { id: "u1", name: "Mira" } })
    m.venueFind.mockResolvedValue({ id: "cm123", name: "The Gilded Lily", slug: "gilded-lily" })
    m.upsert.mockResolvedValue({})
    m.notify.mockReturnValue(Promise.resolve())
  })

  it("links the owner notification to the venue's slug, which the dashboard routes by", async () => {
    const res = await call()

    expect(res.status).toBe(200)
    expect(m.notify).toHaveBeenCalledWith(
      "cm123",
      expect.objectContaining({ type: "NEW_FOLLOWER", link: "/dashboard/gilded-lily/analytics" })
    )
  })
})
