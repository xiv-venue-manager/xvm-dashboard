import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PublicPlatformStats } from "@/lib/api/xvm-api"
import { getPublicPlatformStats } from "@/lib/api/xvm-api"
import { getPublicStats } from "./public-stats"

vi.mock("@/lib/redis-cache", () => ({
  getOrSet: (_key: string, fetchFn: () => Promise<unknown>) => fetchFn(),
  cacheKeys: { publicStats: () => "public-stats" },
  cacheTTL: { publicStats: 300 },
}))
vi.mock("@/lib/api/xvm-api", () => ({ getPublicPlatformStats: vi.fn() }))

const emptyPlatform: PublicPlatformStats = {
  venues_total: 0,
  venues_active_last_30d: 0,
  venues_created_last_7d: 0,
  venues_by_data_center: {},
  venues_by_type: {},
  first_venue_at: null,
  events_total: 0,
  events_last_7d: 0,
  events_partake_linked: 0,
  events_by_weekday_hour_last_90d: Array.from({ length: 7 }, () => new Array(24).fill(0)),
  plugin_installs: 0,
  patron_entries_total: 0,
  shifts_total: 0,
  shifts_created_last_7d: 0,
  tasks_completed: 0,
  transactions_by_kind: {},
  last_activity_at: null,
  generated_at: "2026-10-03T00:00:00Z",
}

function platform(overrides: Partial<PublicPlatformStats>): PublicPlatformStats {
  return { ...emptyPlatform, ...overrides }
}

beforeEach(() => {
  vi.mocked(getPublicPlatformStats).mockReset()
})

describe("getPublicStats", () => {
  it("answers zeros and nulls for an empty platform", async () => {
    vi.mocked(getPublicPlatformStats).mockResolvedValue(emptyPlatform)
    const stats = await getPublicStats()
    expect(stats).toMatchObject({
      venuesTotal: 0,
      salesTotal: 0,
      gilTracked: 0,
      dataCenters: 0,
      dcBreakdown: [],
      venueTypeBreakdown: [],
      firstVenueAt: null,
      lastActivityAt: null,
    })
    expect(stats.busiestNights.map((night) => night.pct)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it("maps each platform figure onto its field", async () => {
    vi.mocked(getPublicPlatformStats).mockResolvedValue(
      platform({
        venues_total: 5,
        venues_active_last_30d: 4,
        venues_created_last_7d: 2,
        first_venue_at: "2026-01-02T03:04:05Z",
        events_total: 40,
        events_last_7d: 6,
        events_partake_linked: 7,
        plugin_installs: 9,
        patron_entries_total: 300,
        shifts_total: 80,
        shifts_created_last_7d: 11,
        tasks_completed: 12,
        last_activity_at: "2026-10-02T22:00:00Z",
      }),
    )
    expect(await getPublicStats()).toMatchObject({
      venuesTotal: 5,
      venuesActive30d: 4,
      newVenuesThisWeek: 2,
      firstVenueAt: "2026-01-02T03:04:05Z",
      eventsTotal: 40,
      eventsThisWeek: 6,
      partakeEventsSynced: 7,
      pluginInstalls: 9,
      patronEntriesTotal: 300,
      shiftsTotal: 80,
      shiftsThisWeek: 11,
      tasksCompleted: 12,
      lastActivityAt: "2026-10-02T22:00:00Z",
    })
  })

  it("counts income kinds as sales and gil, and leaves expenses and payouts out", async () => {
    vi.mocked(getPublicPlatformStats).mockResolvedValue(
      platform({
        transactions_by_kind: {
          sale: { count: 3, amount_sum: 300 },
          tip: { count: 2, amount_sum: 50 },
          cover_charge: { count: 1, amount_sum: 20 },
          other_income: { count: 0, amount_sum: 0 },
          expense: { count: 4, amount_sum: 9000 },
          payout: { count: 5, amount_sum: 7000 },
        },
      }),
    )
    const stats = await getPublicStats()
    expect(stats.salesTotal).toBe(6)
    expect(stats.gilTracked).toBe(370)
  })

  it("lists data centers and venue types by count, ties by name, with percentages of the typed venues", async () => {
    vi.mocked(getPublicPlatformStats).mockResolvedValue(
      platform({
        venues_by_data_center: { Crystal: 2, Aether: 2, Light: 5 },
        venues_by_type: { NIGHTCLUB: 1, BAR_TAVERN: 3, MYSTERY: 1 },
      }),
    )
    const stats = await getPublicStats()
    expect(stats.dataCenters).toBe(3)
    expect(stats.dcBreakdown).toEqual([
      { dataCenter: "Light", count: 5 },
      { dataCenter: "Aether", count: 2 },
      { dataCenter: "Crystal", count: 2 },
    ])
    expect(stats.venueTypeBreakdown).toEqual([
      { type: "BAR_TAVERN", label: "Bar / Tavern", count: 3, pct: 60 },
      { type: "MYSTERY", label: "MYSTERY", count: 1, pct: 20 },
      { type: "NIGHTCLUB", label: "Nightclub", count: 1, pct: 20 },
    ])
  })

  it("scales the busiest nights against the busiest day, Monday first", async () => {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
    grid[0][20] = 1
    grid[5][21] = 3
    grid[5][22] = 1
    vi.mocked(getPublicPlatformStats).mockResolvedValue(platform({ events_by_weekday_hour_last_90d: grid }))
    const stats = await getPublicStats()
    expect(stats.busiestNights[0]).toEqual({ day: "Mon", count: 1, pct: 25 })
    expect(stats.busiestNights[5]).toEqual({ day: "Sat", count: 4, pct: 100 })
  })
})
