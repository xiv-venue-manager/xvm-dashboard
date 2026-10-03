import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockStats } = vi.hoisted(() => ({ mockStats: vi.fn() }))

vi.hoisted(() => {
  process.env.HOMEPAGE_API_KEY = "test-key"
})
vi.mock("@/lib/public-stats", () => ({ getPublicStats: mockStats }))

import { GET } from "./route"

const call = (key?: string) =>
  GET(new Request("http://localhost/api/homepage", { headers: key ? { "X-API-Key": key } : {} }))

const stats = {
  venuesTotal: 3,
  venuesActive30d: 2,
  eventsTotal: 10,
  partakeEventsSynced: 1,
  salesTotal: 4,
  gilTracked: 300000,
  pluginInstalls: 5,
  patronEntriesTotal: 6,
  dataCenters: 2,
  generatedAt: "2026-10-03T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/homepage", () => {
  it("answers 401 without the key", async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(mockStats).not.toHaveBeenCalled()
  })

  it("maps the stats for a valid key", async () => {
    mockStats.mockResolvedValue(stats)
    const res = await call("test-key")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ totalVenues: 3, totalTransactions: 4, gilTracked: 300000, lastUpdated: stats.generatedAt })
  })

  it("answers a 500 with a body and the CORS header when the stats fail", async () => {
    mockStats.mockRejectedValue(new Error("xvm-api down"))
    const res = await call("test-key")
    expect(res.status).toBe(500)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(await res.json()).toEqual({ error: "Stats unavailable" })
  })
})
