import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venue: vi.fn(),
  token: vi.fn(),
  getEvent: vi.fn(),
  endEventSeries: vi.fn(),
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
  return { ...actual, getEvent: m.getEvent, endEventSeries: m.endEventSeries }
})

import { POST } from "./route"

const call = (eventId = "7") =>
  POST(new Request("http://localhost/api", { method: "POST" }) as never, {
    params: Promise.resolve({ venueId: "venue-1", eventId }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
})

describe("POST cancel-series", () => {
  it("ends the event's series and cancels the future occurrences", async () => {
    m.getEvent.mockResolvedValue({ recurrence_rule_id: 3 })
    m.endEventSeries.mockResolvedValue({ cancelled: 4 })
    const res = await call()
    expect(m.endEventSeries).toHaveBeenCalledWith("tok", "xv-1", 3, { cancel_future: true, reason: null })
    expect(await res.json()).toEqual({ cancelled: 4 })
  })

  it("reports zero cancelled for an event outside any series", async () => {
    m.getEvent.mockResolvedValue({ recurrence_rule_id: null })
    const res = await call()
    expect(await res.json()).toEqual({ cancelled: 0 })
    expect(m.endEventSeries).not.toHaveBeenCalled()
  })

  it("returns 404 for an old cuid id", async () => {
    expect((await call("cmabc123")).status).toBe(404)
    expect(m.getEvent).not.toHaveBeenCalled()
  })
})
