import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockToken, mockVenue, mockCreate } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockToken: vi.fn(),
  mockVenue: vi.fn(),
  mockCreate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: mockVenue } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockToken,
  xvmApiErrorResponse: () => new Response(null, { status: 500 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ createInvite: mockCreate }))

import { POST } from "./route"

const call = (body: unknown) =>
  (POST as unknown as (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>)(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ venueId: "venue-1" }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockToken.mockResolvedValue("tok")
  mockVenue.mockResolvedValue({ xvmApiVenueId: "xvm-1" })
  mockCreate.mockResolvedValue({ id: 9, token: "abc", expires_at: "2026-10-01T00:00:00Z" })
})

describe("POST staff/invite", () => {
  it("passes the Discord id to xvm-api as external_id", async () => {
    const res = await call({ role: "STAFF", invitedName: "Heir", discordId: "123456789012345678" })
    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith("tok", "xvm-1", {
      display_name: "Heir",
      tier: "staff",
      external_id: "123456789012345678",
    })
  })

  it("sends a null external_id when no Discord id is given", async () => {
    await call({ role: "STAFF", invitedName: "Heir" })
    expect(mockCreate.mock.calls[0][2].external_id).toBeNull()
  })

  it("rejects a Discord id that is not numeric, before calling xvm-api", async () => {
    const res = await call({ role: "STAFF", discordId: "not-a-snowflake" })
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
