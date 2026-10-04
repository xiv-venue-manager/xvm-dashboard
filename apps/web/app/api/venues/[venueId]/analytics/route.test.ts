import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  venueFind: vi.fn(),
  membership: vi.fn(),
  events: vi.fn(),
  patronLogs: vi.fn(),
  patronGroup: vi.fn(),
  followCount: vi.fn(),
  followList: vi.fn(),
  token: vi.fn(),
  fetchInputs: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    venue: { findFirst: m.venueFind },
    membership: { findFirst: m.membership },
    event: { findMany: m.events },
    patronLog: { findMany: m.patronLogs, groupBy: m.patronGroup },
    venueFollow: { count: m.followCount, findMany: m.followList },
  },
}))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/analytics-money", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics-money")>()
  return { ...actual, fetchMoneyInputs: m.fetchInputs }
})

import { GET } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const call = (query = "") =>
  (GET as unknown as Handler)(new Request(`http://localhost/api/venues/test-venue/analytics${query}`), {
    params: Promise.resolve({ venueId: "test-venue" }),
  })

const recently = (days: number) => new Date(Date.now() - days * 86400000)

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.venueFind.mockResolvedValue({ id: "venue-1", name: "Test-Venue", xvmApiVenueId: "xvm-venue" })
  m.membership.mockResolvedValue({ role: "OWNER" })
  m.token.mockResolvedValue("person-token")
  m.events.mockResolvedValue([])
  m.patronLogs.mockResolvedValue([])
  m.patronGroup.mockResolvedValue([])
  m.followCount.mockResolvedValue(0)
  m.followList.mockResolvedValue([])
  m.fetchInputs.mockResolvedValue({ events: [], rows: [], payroll: [] })
})

describe("GET /api/venues/[venueId]/analytics", () => {
  it("requires a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it("keeps analytics to owners and managers", async () => {
    m.membership.mockResolvedValue({ role: "STAFF" })
    expect((await call()).status).toBe(403)
    expect(m.fetchInputs).not.toHaveBeenCalled()
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

  it("builds the money fields from xvm-api and keeps the door fields", async () => {
    m.fetchInputs.mockResolvedValue({
      events: [
        {
          id: "7",
          materialized: true,
          title: "Karaoke",
          status: "COMPLETED",
          startTime: recently(3),
          endTime: new Date(recently(3).getTime() + 3 * 3600000),
        },
      ],
      rows: [
        { id: 1, entry_type: "revenue", status: "posted", amount: 250, event_id: 7, service_name: "Drinks", created_at: recently(3).toISOString() },
      ],
      payroll: [],
    })
    const res = await call("?period=90d")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(m.fetchInputs).toHaveBeenCalledWith("person-token", "xvm-venue", "90d", expect.any(Date))
    expect(body.revenueByEvent).toMatchObject([{ eventId: "7", eventTitle: "Karaoke", revenue: 250, payroll: 0, netProfit: 250 }])
    expect(body.serviceRevenue).toEqual([{ name: "Drinks", revenue: 250 }])
    expect(body.summary).toMatchObject({ totalRevenue: 250, totalTransactions: 1, completed: 1, totalPatrons: 0, repeatRate: 0 })
    expect(body.financial.totalRevenue).toBe(250)
    expect(body.followers.total).toBe(0)
  })

  it("treats an unknown period as 30 days", async () => {
    await call("?period=forever")
    expect(m.fetchInputs).toHaveBeenCalledWith("person-token", "xvm-venue", "30d", expect.any(Date))
  })

  it("forwards an xvm-api failure's status instead of reporting empty analytics", async () => {
    m.fetchInputs.mockRejectedValue(new XvmApiError(500, JSON.stringify({ detail: "boom" })))
    expect((await call()).status).toBe(500)
  })
})
