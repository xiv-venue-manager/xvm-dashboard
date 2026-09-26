import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), venue: vi.fn(), token: vi.fn(), preview: vi.fn(), generate: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: m.venue } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  previewPot: m.preview,
  generatePot: m.generate,
}))

import { GET, POST } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; eventId: string }> }) => Promise<Response>
const call = (handler: unknown, eventId = "7") =>
  (handler as Handler)(new Request("http://localhost/api"), {
    params: Promise.resolve({ venueId: "venue-1", eventId }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
})

describe("GET pot-payroll preview", () => {
  it("returns the API's preview for the event", async () => {
    m.preview.mockResolvedValue({ event_id: 7, pot_total_minor: 900 })
    const res = await call(GET)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ preview: { event_id: 7, pot_total_minor: 900 } })
    expect(m.preview).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("passes the API's manager-tier refusal through", async () => {
    m.preview.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Manager tier required." })))
    const res = await call(GET)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Manager tier required." })
  })

  it("returns 404 for an old cuid event id without calling xvm-api", async () => {
    expect((await call(GET, "cmabc123")).status).toBe(404)
    expect(m.preview).not.toHaveBeenCalled()
  })

  it("returns 409 for a venue that is not connected", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null })
    expect((await call(GET)).status).toBe(409)
  })
})

describe("POST pot-payroll generate", () => {
  it("generates the distribution and answers 201", async () => {
    m.generate.mockResolvedValue({ id: 3, event_id: 7, recipient_count: 2, per_person_share_minor: 450 })
    const res = await call(POST)
    expect(res.status).toBe(201)
    expect((await res.json()).distribution.id).toBe(3)
    expect(m.generate).toHaveBeenCalledWith("tok", "xv-1", 7)
  })

  it("passes the API's refusal for an event that has not ended through as a 409 with its message", async () => {
    m.generate.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "The event has not ended." })))
    const res = await call(POST)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "The event has not ended." })
  })
})
