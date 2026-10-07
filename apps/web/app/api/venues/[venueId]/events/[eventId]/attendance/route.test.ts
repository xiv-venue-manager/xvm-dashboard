import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  venue: vi.fn(),
  token: vi.fn(),
  getEvent: vi.fn(),
  logs: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: m.membership },
    venue: { findUnique: m.venue },
    xvmApiCredential: { deleteMany: m.invalidate },
  },
}))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getEvent: m.getEvent,
}))
vi.mock("@/lib/api/patron-logs", () => ({ listAllPatronLogs: m.logs }))

import { GET } from "./route"
import { XvmApiError, type PatronLogRow } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; eventId: string }> }) => Promise<Response>
const call = (eventId = "7") =>
  (GET as unknown as Handler)(new Request("http://localhost/api"), {
    params: Promise.resolve({ venueId: "venue-1", eventId }),
  })
const log = (id: number, ts: string, change: number) => ({ id, ts, count_change: change }) as unknown as PatronLogRow

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.membership.mockResolvedValue({ id: "m1" })
  m.venue.mockResolvedValue({ xvmApiVenueId: "xv-1" })
  m.token.mockResolvedValue("tok")
  m.getEvent.mockResolvedValue({ id: 7 })
  m.logs.mockResolvedValue([])
})

describe("GET attendance", () => {
  it("is 401 signed out and 403 for a non-member", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    m.session.mockResolvedValue({ user: { id: "user-1" } })
    m.membership.mockResolvedValue(null)
    expect((await call()).status).toBe(403)
  })

  it("is 409 not_connected when the venue has no xvm-api link, not a 404", async () => {
    m.venue.mockResolvedValue({ xvmApiVenueId: null })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
  })

  it("is 503 when there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
  })

  it("is 404 for a non-numeric event id without calling xvm-api", async () => {
    expect((await call("cm1abc")).status).toBe(404)
    expect(m.getEvent).not.toHaveBeenCalled()
  })

  it("forwards xvm-api's 404 for an event at another venue or that does not exist", async () => {
    m.getEvent.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "No such event at this venue." })))
    const res = await call()
    expect(res.status).toBe(404)
    expect(m.logs).not.toHaveBeenCalled()
  })

  it("does not turn an xvm-api outage on the logs read into an empty series", async () => {
    m.logs.mockRejectedValue(new XvmApiError(500, "boom"))
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).not.toEqual([])
  })

  it("is 503 and drops the cached credential when xvm-api rejects it", async () => {
    m.getEvent.mockRejectedValue(new XvmApiError(401, "expired"))
    const res = await call()
    expect(res.status).toBe(503)
    expect(m.invalidate).toHaveBeenCalledWith({ where: { userId: "user-1" } })
  })

  it("returns the running count in time order, never below zero", async () => {
    m.logs.mockResolvedValue([
      log(3, "2026-10-06T20:30:00Z", -1),
      log(1, "2026-10-06T20:00:00Z", 1),
      log(2, "2026-10-06T20:10:00Z", 1),
    ])
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).map((p: { count: number }) => p.count)).toEqual([1, 2, 1])
    expect(m.logs).toHaveBeenCalledWith("tok", "xv-1", { eventId: 7, classification: "patron" })
  })

  it("returns an empty series only when the event genuinely has no logs", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
