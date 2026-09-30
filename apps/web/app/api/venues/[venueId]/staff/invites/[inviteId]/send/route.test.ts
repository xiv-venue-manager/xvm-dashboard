import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockToken, mockVenue, mockSend } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockToken: vi.fn(),
  mockVenue: vi.fn(),
  mockSend: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: mockVenue } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ sendInviteByDm: mockSend }))

import { POST } from "./route"

const call = (venueId: string, inviteId: string) =>
  (POST as unknown as (req: Request, ctx: { params: Promise<{ venueId: string; inviteId: string }> }) => Promise<Response>)(
    new Request("http://localhost/api", { method: "POST" }),
    { params: Promise.resolve({ venueId, inviteId }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockToken.mockResolvedValue("tok")
  mockVenue.mockResolvedValue({ xvmApiVenueId: "xvm-1" })
  mockSend.mockResolvedValue(undefined)
})

describe("POST staff/invites/[inviteId]/send", () => {
  it("sends the invite by DM through xvm-api", async () => {
    const res = await call("venue-1", "9")
    expect(res.status).toBe(200)
    expect(mockSend).toHaveBeenCalledWith("tok", "xvm-1", 9)
  })

  it("rejects an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    const res = await call("venue-1", "9")
    expect(res.status).toBe(401)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric invite id before calling xvm-api", async () => {
    const res = await call("venue-1", "not-a-number")
    expect(res.status).toBe(404)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("rejects a venue that has no xvm-api link", async () => {
    mockVenue.mockResolvedValue({ xvmApiVenueId: null })
    const res = await call("venue-1", "9")
    expect(res.status).toBe(409)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
