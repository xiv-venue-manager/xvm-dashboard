import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockToken, mockVenue, mockReissue, mockError } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockToken: vi.fn(),
  mockVenue: vi.fn(),
  mockReissue: vi.fn(),
  mockError: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: mockVenue } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: mockError,
}))
vi.mock("@/lib/api/xvm-api", () => ({ reissueInvite: mockReissue }))

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
  mockReissue.mockResolvedValue({ id: 9, token: "new-token", expires_at: "2026-10-14T00:00:00Z" })
  mockError.mockResolvedValue(new Response(JSON.stringify({ error: "forwarded" }), { status: 409 }))
})

describe("POST staff/invites/[inviteId]/reissue", () => {
  it("re-issues the invite through xvm-api and returns the new token and expiry", async () => {
    const res = await call("venue-1", "9")
    expect(res.status).toBe(200)
    expect(mockReissue).toHaveBeenCalledWith("tok", "xvm-1", 9)
    expect(await res.json()).toEqual({
      success: true,
      invite: { id: 9, inviteToken: "new-token", expiresAt: "2026-10-14T00:00:00Z" },
    })
  })

  it("rejects an unauthenticated request before calling xvm-api", async () => {
    mockSession.mockResolvedValue(null)
    expect((await call("venue-1", "9")).status).toBe(401)
    expect(mockReissue).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    mockToken.mockResolvedValue(null)
    expect((await call("venue-1", "9")).status).toBe(503)
    expect(mockReissue).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric invite id before calling xvm-api", async () => {
    expect((await call("venue-1", "not-a-number")).status).toBe(404)
    expect(mockReissue).not.toHaveBeenCalled()
  })

  it("rejects a venue that has no xvm-api link", async () => {
    mockVenue.mockResolvedValue({ xvmApiVenueId: null })
    expect((await call("venue-1", "9")).status).toBe(409)
    expect(mockReissue).not.toHaveBeenCalled()
  })

  it("hands an xvm-api failure, such as the invitee having joined, to the shared error response", async () => {
    mockReissue.mockRejectedValue(new Error("This person is already a member of this venue."))
    const res = await call("venue-1", "9")
    expect(res.status).toBe(409)
    expect(mockError).toHaveBeenCalledTimes(1)
  })
})
