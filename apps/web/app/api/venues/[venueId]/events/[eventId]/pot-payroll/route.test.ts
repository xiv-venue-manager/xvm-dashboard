import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSession, mockVenue, mockMembership, mockEvent } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockVenue: vi.fn(),
  mockMembership: vi.fn(),
  mockEvent: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: mockSession }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({
  withRateLimit: (handler: unknown) => handler,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    venue: { findFirst: mockVenue },
    membership: { findFirst: mockMembership },
    event: { findFirst: mockEvent },
  },
}))

import { GET } from "./route"

const call = () =>
  (GET as unknown as (req: Request, ctx: { params: Promise<{ venueId: string; eventId: string }> }) => Promise<Response>)(
    new Request("http://localhost/api"),
    { params: Promise.resolve({ venueId: "venue-1", eventId: "event-1" }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mockSession.mockResolvedValue({ user: { id: "user-1" } })
  mockVenue.mockResolvedValue({ id: "venue-1" })
  mockEvent.mockResolvedValue(null)
})

describe("GET pot-payroll preview", () => {
  it("refuses staff before looking up the event", async () => {
    mockMembership.mockResolvedValue({ role: "STAFF" })
    const res = await call()
    expect(res.status).toBe(403)
    expect(mockEvent).not.toHaveBeenCalled()
  })

  it.each(["OWNER", "MANAGER"])("lets a %s through to the event lookup", async (role) => {
    mockMembership.mockResolvedValue({ role })
    const res = await call()
    expect(res.status).toBe(404)
    expect(mockEvent).toHaveBeenCalledOnce()
  })

  it("still refuses a non-member", async () => {
    mockMembership.mockResolvedValue(null)
    expect((await call()).status).toBe(403)
    expect(mockEvent).not.toHaveBeenCalled()
  })
})
