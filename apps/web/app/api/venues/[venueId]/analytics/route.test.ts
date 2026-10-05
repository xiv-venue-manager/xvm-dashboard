import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venueFind: vi.fn(),
  token: vi.fn(),
  fetchMoney: vi.fn(),
  fetchDoor: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findFirst: m.venueFind } } }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/analytics-money", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics-money")>()
  return { ...actual, fetchMoneyInputs: m.fetchMoney }
})
vi.mock("@/lib/api/analytics-door", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics-door")>()
  return { ...actual, fetchDoorInputs: m.fetchDoor }
})

import { GET } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const call = (query = "") =>
  (GET as unknown as Handler)(new Request(`http://localhost/api/venues/test-venue/analytics${query}`), {
    params: Promise.resolve({ venueId: "test-venue" }),
  })

const recently = (days: number) => new Date(Date.now() - days * 86400000)

const completedEvent = () => ({
  id: "7",
  materialized: true,
  title: "Karaoke",
  status: "COMPLETED",
  startTime: recently(3),
  endTime: new Date(recently(3).getTime() + 3 * 3600000),
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.venueFind.mockResolvedValue({ id: "venue-1", name: "Test-Venue", xvmApiVenueId: "xvm-venue" })
  m.token.mockResolvedValue("person-token")
  m.fetchMoney.mockResolvedValue({ events: [], rows: [], payroll: [] })
  m.fetchDoor.mockResolvedValue({ logs: [], patrons: [], followerCount: 0 })
})

describe("GET /api/venues/[venueId]/analytics", () => {
  it("requires a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it("answers 404 for an unknown venue", async () => {
    m.venueFind.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it("answers 409 for a venue not connected to xvm-api", async () => {
    m.venueFind.mockResolvedValue({ id: "venue-1", name: "Test-Venue", xvmApiVenueId: null })
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("not_connected")
  })

  it("answers 503 when the xvm-api link has lapsed", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
  })

  it("passes xvm-api's refusal of a non-manager through as a 403 and returns no data", async () => {
    m.fetchMoney.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Manager tier required." })))
    const res = await call()
    expect(res.status).toBe(403)
    expect(m.fetchDoor).not.toHaveBeenCalled()
  })

  it("forwards any other xvm-api failure's status instead of reporting empty analytics", async () => {
    m.fetchDoor.mockRejectedValue(new XvmApiError(500, JSON.stringify({ detail: "boom" })))
    m.fetchMoney.mockResolvedValue({ events: [completedEvent()], rows: [], payroll: [] })
    expect((await call()).status).toBe(500)
  })

  it("merges the money and door fields into one response", async () => {
    const event = completedEvent()
    m.fetchMoney.mockResolvedValue({
      events: [event],
      rows: [
        { id: 1, entry_type: "revenue", status: "posted", amount: 250, event_id: 7, service_name: "Drinks", created_at: recently(3).toISOString() },
      ],
      payroll: [],
    })
    m.fetchDoor.mockResolvedValue({
      logs: [
        { id: 1, event_id: 7, ts: new Date(event.startTime.getTime() + 60000).toISOString(), count_change: 1, was_working: false },
        { id: 2, event_id: 7, ts: new Date(event.startTime.getTime() + 120000).toISOString(), count_change: 1, was_working: false },
      ],
      patrons: [{ visits: 1 }, { visits: 4 }],
      followerCount: 3,
    })
    const res = await call("?period=90d")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(m.fetchMoney).toHaveBeenCalledWith("person-token", "xvm-venue", "90d", expect.any(Date))
    expect(m.fetchDoor).toHaveBeenCalledWith("person-token", "xvm-venue", [expect.objectContaining({ id: "7" })])
    expect(body.revenueByEvent).toMatchObject([{ eventId: "7", revenue: 250, netProfit: 250 }])
    expect(body.serviceRevenue).toEqual([{ name: "Drinks", revenue: 250 }])
    expect(body.patronByEvent).toMatchObject([{ eventId: "7", peakPatrons: 2 }])
    expect(body.summary).toMatchObject({ totalRevenue: 250, totalPatrons: 2, repeatRate: 50, completed: 1 })
    expect(body.patronMix).toMatchObject({ new: 1, regular: 1, vip: 0, total: 2 })
    expect(body.followers).toEqual({ total: 3, byMonth: {} })
    expect(body.busiestNights).toHaveLength(7)
  })

  it("treats an unknown period as 30 days", async () => {
    await call("?period=forever")
    expect(m.fetchMoney).toHaveBeenCalledWith("person-token", "xvm-venue", "30d", expect.any(Date))
  })
})
