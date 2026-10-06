import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ logs: vi.fn(), patrons: vi.fn(), followers: vi.fn() }))

vi.mock("@/lib/api/xvm-api", () => ({
  listPatronLogs: m.logs,
  listPatrons: m.patrons,
  getVenueFollowers: m.followers,
}))

import { buildDoorAnalytics, fetchDoorInputs, type DoorInputs } from "./analytics-door"
import type { PatronLogRow, PatronSummary } from "./xvm-api"
import type { PageEvent } from "./event-window"

let nextId = 1
const event = (start: string, hours = 3, title = "Night"): PageEvent =>
  ({
    id: String(nextId++),
    title,
    status: "COMPLETED",
    startTime: new Date(start),
    endTime: new Date(new Date(start).getTime() + hours * 3600000),
  }) as PageEvent

const log = (e: PageEvent, ts: string, change: number, overrides: Partial<PatronLogRow> = {}): PatronLogRow => ({
  id: nextId++,
  character_name: "Someone",
  world: "Cactuar",
  action: change > 0 ? "enter" : "leave",
  count_change: change,
  event_id: Number(e.id),
  ts,
  logged_at: ts,
  logged_by_person_id: null,
  was_working: false,
  working_person_id: null,
  reclassified_at: null,
  reclassified_by_person_id: null,
  reclassify_reason: null,
  ...overrides,
})

const patron = (visits: number) => ({ visits }) as PatronSummary
const inputs = (overrides: Partial<DoorInputs> = {}): DoorInputs => ({ logs: [], patrons: [], followerCount: 0, ...overrides })

describe("buildDoorAnalytics", () => {
  it("returns zeros and empty lists for no data", () => {
    const result = buildDoorAnalytics(inputs(), [])
    expect(result).toMatchObject({ totalPatrons: 0, repeatRate: 0, patronByEvent: [], attendanceByHour: [] })
    expect(result.busiestNights).toHaveLength(7)
    expect(result.busiestNights.every((night) => night.count === 0 && night.pct === 0)).toBe(true)
    expect(result.patronMix).toMatchObject({ new: 0, regular: 0, vip: 0, total: 1, newPct: 0 })
    expect(result.followers).toEqual({ total: 0, byMonth: {} })
  })

  it("takes an event's peak from the running count, never below zero", () => {
    const a = event("2026-09-26T12:00:00Z")
    const b = event("2026-09-27T12:00:00Z")
    const result = buildDoorAnalytics(
      inputs({
        logs: [
          log(a, "2026-09-26T12:01:00Z", 1),
          log(a, "2026-09-26T12:02:00Z", 1),
          log(a, "2026-09-26T12:03:00Z", 1),
          log(a, "2026-09-26T12:04:00Z", -1),
          log(a, "2026-09-26T12:05:00Z", 1),
          log(b, "2026-09-27T12:01:00Z", -1),
          log(b, "2026-09-27T12:02:00Z", 1),
          log(b, "2026-09-27T12:03:00Z", 1),
        ],
      }),
      [b, a]
    )
    expect(result.patronByEvent.map((e) => [e.eventId, e.peakPatrons])).toEqual([
      [a.id, 3],
      [b.id, 1],
    ])
    expect(result.totalPatrons).toBe(4)
  })

  it("charts the seven newest events, oldest first", () => {
    const events = Array.from({ length: 9 }, (_, i) => event(`2026-09-${String(20 - i).padStart(2, "0")}T12:00:00Z`))
    const result = buildDoorAnalytics(inputs(), events)
    expect(result.patronByEvent).toHaveLength(7)
    expect(result.patronByEvent[0].eventId).toBe(events[6].id)
    expect(result.patronByEvent[6].eventId).toBe(events[0].id)
  })

  it("ignores staff crossings and reads rows in time order whatever order they arrive in", () => {
    const e = event("2026-09-26T12:00:00Z")
    const result = buildDoorAnalytics(
      inputs({
        logs: [
          log(e, "2026-09-26T12:03:00Z", -1),
          log(e, "2026-09-26T12:02:00Z", 1, { was_working: true }),
          log(e, "2026-09-26T12:02:00Z", 1),
          log(e, "2026-09-26T12:01:00Z", 1),
        ],
      }),
      [e]
    )
    expect(result.patronByEvent[0].peakPatrons).toBe(2)
    expect(result.busiestNights.reduce((sum, night) => sum + night.count, 0)).toBe(2)
  })

  it("averages the running count into fifteen-minute slots across events", () => {
    const a = event("2026-09-26T12:00:00Z", 1)
    const b = event("2026-09-27T12:00:00Z", 1)
    const result = buildDoorAnalytics(
      inputs({
        logs: [log(a, "2026-09-26T12:00:00Z", 1), log(a, "2026-09-26T12:20:00Z", 1), log(b, "2026-09-27T12:00:00Z", 1)],
      }),
      [a, b]
    )
    expect(result.attendanceByHour.map((slot) => slot.avgCount)).toEqual([1, 1, 2, 2, 2])
  })

  it("counts entries by weekday and scales to the busiest", () => {
    const e = event("2026-09-26T12:00:00Z")
    const result = buildDoorAnalytics(
      inputs({
        logs: [
          log(e, "2026-09-26T12:00:00Z", 1),
          log(e, "2026-09-26T12:10:00Z", 1),
          log(e, "2026-09-26T12:20:00Z", -1),
          log(e, "2026-09-27T12:00:00Z", 1),
        ],
      }),
      [e]
    )
    const byDay = Object.fromEntries(result.busiestNights.map((night) => [night.day, night]))
    expect(byDay.Sat).toEqual({ day: "Sat", count: 2, pct: 100 })
    expect(byDay.Sun).toEqual({ day: "Sun", count: 1, pct: 50 })
    expect(byDay.Mon.count).toBe(0)
  })

  it("splits patrons into new, regular and VIP by visits, and ignores people who never came through", () => {
    const result = buildDoorAnalytics(inputs({ patrons: [0, 1, 2, 3, 9, 10, 40].map(patron) }), [])
    expect(result.patronMix).toEqual({ new: 2, regular: 2, vip: 2, total: 6, newPct: 33, regularPct: 33, vipPct: 33 })
    expect(result.repeatRate).toBe(67)
  })

  it("reports no repeat rate for a single patron", () => {
    expect(buildDoorAnalytics(inputs({ patrons: [patron(12)] }), []).repeatRate).toBe(0)
  })

  it("passes the follower count through with no monthly history", () => {
    expect(buildDoorAnalytics(inputs({ followerCount: 7 }), []).followers).toEqual({ total: 7, byMonth: {} })
  })
})

describe("fetchDoorInputs", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.patrons.mockResolvedValue([patron(3)])
    m.followers.mockResolvedValue({ count: 5, followers: [] })
  })

  const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: from - i }) as PatronLogRow)

  it("reads each event's patron logs, following the cursor until a short page", async () => {
    const a = event("2026-09-26T12:00:00Z")
    const b = event("2026-09-27T12:00:00Z")
    m.logs.mockImplementation(async (_t: string, _v: string, opts: { eventId: number; before?: number }) => {
      if (opts.eventId !== Number(a.id)) return page(900, 3)
      return opts.before === undefined ? page(500, 200) : page(300, 50)
    })
    const result = await fetchDoorInputs("token", "xvm-venue", [a, b])
    expect(result.logs).toHaveLength(253)
    expect(result.patrons).toHaveLength(1)
    expect(result.followerCount).toBe(5)

    const callsFor = (e: PageEvent) => m.logs.mock.calls.filter((c) => c[2].eventId === Number(e.id)).map((c) => c[2])
    expect(callsFor(a)).toEqual([
      { eventId: Number(a.id), classification: "patron", before: undefined, limit: 199 },
      { eventId: Number(a.id), classification: "patron", before: 301, limit: 199 },
    ])
    expect(callsFor(b)).toHaveLength(1)
  })
})
