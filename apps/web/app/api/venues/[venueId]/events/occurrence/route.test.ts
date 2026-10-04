import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venue: vi.fn(),
  token: vi.fn(),
  materialize: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/xvm-api")>()
  return { ...actual, materializeEvent: m.materialize }
})

import { GET } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const AT = "2026-11-01T20:00:00.000Z"
const call = (query: string) =>
  GET(new Request(`http://localhost/api/venues/venue-1/events/occurrence?${query}`) as never, {
    params: Promise.resolve({ venueId: "venue-1" }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("person-token")
  m.venue.mockResolvedValue({ slug: "test-venue", xvmApiVenueId: "xvm-venue" })
  m.materialize.mockResolvedValue({ id: 41 })
})

describe("GET /api/venues/[venueId]/events/occurrence", () => {
  it("materializes the occurrence and redirects to its page", async () => {
    const res = await call(`rule=3&at=${encodeURIComponent(AT)}`)
    expect(m.materialize).toHaveBeenCalledWith("person-token", "xvm-venue", { recurrence_rule_id: 3, scheduled_at: AT })
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("/dashboard/test-venue/events/41")
  })

  it("redirects to the edit page when asked", async () => {
    const res = await call(`rule=3&at=${encodeURIComponent(AT)}&to=edit`)
    expect(res.headers.get("location")).toBe("/dashboard/test-venue/events/41/edit")
  })

  it("rejects a missing or malformed rule or instant without calling xvm-api", async () => {
    expect((await call(`at=${encodeURIComponent(AT)}`)).status).toBe(400)
    expect((await call(`rule=abc&at=${encodeURIComponent(AT)}`)).status).toBe(400)
    expect((await call("rule=3&at=not-a-date")).status).toBe(400)
    expect(m.materialize).not.toHaveBeenCalled()
  })

  it("requires a session and a live xvm-api link", async () => {
    m.session.mockResolvedValue(null)
    expect((await call(`rule=3&at=${encodeURIComponent(AT)}`)).status).toBe(401)
    m.session.mockResolvedValue({ user: { id: "user-1" } })
    m.token.mockResolvedValue(null)
    expect((await call(`rule=3&at=${encodeURIComponent(AT)}`)).status).toBe(503)
  })

  it("answers 409 for a venue not connected to xvm-api", async () => {
    m.venue.mockResolvedValue({ slug: "test-venue", xvmApiVenueId: null })
    expect((await call(`rule=3&at=${encodeURIComponent(AT)}`)).status).toBe(409)
  })

  it.each([400, 403, 404, 409])("sends the user back to the list when xvm-api refuses with %i", async (status) => {
    m.materialize.mockRejectedValue(new XvmApiError(status, JSON.stringify({ detail: "no" })))
    const res = await call(`rule=3&at=${encodeURIComponent(AT)}`)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("/dashboard/test-venue/events")
  })

  it("passes any other xvm-api failure through as an error response", async () => {
    m.materialize.mockRejectedValue(new XvmApiError(500, JSON.stringify({ detail: "boom" })))
    expect((await call(`rule=3&at=${encodeURIComponent(AT)}`)).status).toBe(500)
  })
})
