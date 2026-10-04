import { describe, it, expect } from "vitest"
import { buildMoneyAnalytics, type MoneyInputs } from "./analytics-money"
import type { FinanceTransactionRow, PayrollEntryRow } from "./xvm-api"
import type { PageEvent } from "./event-window"

const NOW = new Date("2026-10-04T12:00:00Z")

let nextId = 1
const event = (overrides: Partial<PageEvent> & { start: string; end?: string }): PageEvent => {
  const { start, end, ...rest } = overrides
  return {
    id: String(nextId++),
    materialized: true,
    title: "Night",
    description: null,
    eventType: "OTHER",
    status: "COMPLETED",
    startTime: new Date(start),
    endTime: new Date(end ?? new Date(new Date(start).getTime() + 3 * 3600000).toISOString()),
    timezone: "UTC",
    location: null,
    imageUrl: null,
    partakeEventId: null,
    recurrenceRuleId: null,
    cancelReason: null,
    scheduledAt: null,
    createdBy: null,
    attendanceCount: null,
    partakeAttendeeCount: null,
    revenue: null,
    ...rest,
  } as PageEvent
}

const row = (overrides: Partial<FinanceTransactionRow>): FinanceTransactionRow => ({
  id: nextId++,
  kind: "sale",
  entry_type: "revenue",
  status: "posted",
  amount: 100,
  category_id: null,
  event_id: null,
  service_id: null,
  service_name: null,
  membership_id: null,
  recorded_by_person_id: null,
  customer_name: null,
  notes: null,
  idempotency_key: null,
  created_at: "2026-09-20T21:00:00Z",
  posted_at: null,
  posted_by_person_id: null,
  voided_at: null,
  voided_by_person_id: null,
  void_reason: null,
  ...overrides,
})

const pay = (overrides: Partial<PayrollEntryRow>): PayrollEntryRow =>
  ({
    id: nextId++,
    total_amount_minor: 50,
    period_start: "2026-09-20T00:00:00Z",
    period_end: "2026-09-20T23:59:00Z",
    is_paid: true,
    ...overrides,
  }) as PayrollEntryRow

const build = (inputs: Partial<MoneyInputs>, period: "30d" | "90d" | "all" = "30d") =>
  buildMoneyAnalytics({ events: [], rows: [], payroll: [], ...inputs }, period, NOW)

describe("buildMoneyAnalytics", () => {
  it("returns zeros and empty lists for no data", () => {
    const result = build({})
    expect(result.revenueByEvent).toEqual([])
    expect(result.serviceRevenue).toEqual([])
    expect(result.summary).toMatchObject({ totalRevenue: 0, avgRevenuePerEvent: 0, avgSpend: 0, totalTransactions: 0, total: 0 })
    expect(result.financial).toEqual({
      totalRevenue: 0,
      totalPayroll: 0,
      netProfit: 0,
      profitMargin: 0,
      payrollAsPercentOfRevenue: 0,
    })
  })

  it("sums an event's posted revenue rows by event id, ignoring pending, expense and payout rows", () => {
    const e = event({ start: "2026-09-20T20:00:00Z" })
    const result = build({
      events: [e],
      rows: [
        row({ event_id: Number(e.id), amount: 100 }),
        row({ event_id: Number(e.id), amount: 40, kind: "tip" }),
        row({ event_id: Number(e.id), amount: 999, status: "pending" }),
        row({ event_id: Number(e.id), amount: 500, kind: "expense", entry_type: "expense" }),
        row({ event_id: Number(e.id), amount: 70, kind: "payout", entry_type: "payout" }),
        row({ event_id: 9999, amount: 1000 }),
      ],
    })
    expect(result.revenueByEvent).toHaveLength(1)
    expect(result.revenueByEvent[0]).toMatchObject({ eventId: e.id, revenue: 140, payroll: 0, netProfit: 140 })
  })

  it("counts rows with no event toward average spend and the transaction count, not toward any event", () => {
    const e = event({ start: "2026-09-20T20:00:00Z" })
    const result = build({
      events: [e],
      rows: [row({ event_id: Number(e.id), amount: 100 }), row({ event_id: null, amount: 300 })],
    })
    expect(result.summary.totalRevenue).toBe(100)
    expect(result.summary.totalTransactions).toBe(2)
    expect(result.summary.avgSpend).toBe(200)
  })

  it("charges an event every paid payroll entry whose period holds the event's day", () => {
    const e = event({ start: "2026-09-20T20:00:00Z" })
    const result = build({
      events: [e],
      rows: [row({ event_id: Number(e.id), amount: 100 })],
      payroll: [
        pay({ total_amount_minor: 30 }),
        pay({ total_amount_minor: 20, period_start: "2026-09-19T00:00:00Z", period_end: "2026-09-21T12:00:00Z" }),
        pay({ total_amount_minor: 999, period_start: "2026-09-21T00:00:00Z", period_end: "2026-09-27T00:00:00Z" }),
        pay({ total_amount_minor: 777, is_paid: false }),
      ],
    })
    expect(result.revenueByEvent[0]).toMatchObject({ revenue: 100, payroll: 50, netProfit: 50 })
  })

  it("charges the full amount against each event when one period covers several (existing behaviour)", () => {
    const a = event({ start: "2026-09-20T20:00:00Z" })
    const b = event({ start: "2026-09-22T20:00:00Z" })
    const result = build({
      events: [a, b],
      payroll: [pay({ total_amount_minor: 60, period_start: "2026-09-19T00:00:00Z", period_end: "2026-09-25T00:00:00Z" })],
    })
    expect(result.revenueByEvent.map((e) => e.payroll)).toEqual([60, 60])
  })

  it("keeps only completed or active events in the chart, oldest first, capped at ten", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      event({ start: `2026-09-${String(i + 1).padStart(2, "0")}T20:00:00Z` })
    )
    const result = build({
      events: [
        ...events,
        event({ start: "2026-09-25T20:00:00Z", status: "CANCELLED" }),
        event({ start: "2026-10-20T20:00:00Z", status: "PUBLISHED" }),
      ],
    })
    expect(result.revenueByEvent).toHaveLength(10)
    const starts = result.revenueByEvent.map((e) => new Date(e.startTime).getTime())
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
    expect(new Date(result.revenueByEvent[9].startTime).toISOString()).toBe("2026-09-12T20:00:00.000Z")
  })

  it("ranks services by revenue, keeps five, and skips rows with no service", () => {
    const names = ["A", "B", "C", "D", "E", "F"]
    const result = build({
      rows: [
        ...names.map((name, i) => row({ service_id: i + 1, service_name: name, amount: (i + 1) * 10 })),
        row({ service_id: 6, service_name: "F", amount: 5 }),
        row({ service_name: null, amount: 9999 }),
      ],
    })
    expect(result.serviceRevenue).toEqual([
      { name: "F", revenue: 65 },
      { name: "E", revenue: 50 },
      { name: "D", revenue: 40 },
      { name: "C", revenue: 30 },
      { name: "B", revenue: 20 },
    ])
  })

  it("builds the financial summary over the span of the last ten events", () => {
    const first = event({ start: "2026-09-10T20:00:00Z", end: "2026-09-10T23:00:00Z" })
    const last = event({ start: "2026-09-20T20:00:00Z", end: "2026-09-20T23:00:00Z" })
    const result = build({
      events: [first, last],
      rows: [
        row({ amount: 400, created_at: "2026-09-10T21:00:00Z" }),
        row({ amount: 600, created_at: "2026-09-20T22:00:00Z" }),
        row({ amount: 5000, created_at: "2026-09-05T21:00:00Z" }),
        row({ amount: 5000, created_at: "2026-09-25T21:00:00Z" }),
      ],
      payroll: [
        pay({ total_amount_minor: 100, period_end: "2026-09-15T00:00:00Z", period_start: "2026-09-14T00:00:00Z" }),
        pay({ total_amount_minor: 900, period_end: "2026-09-26T00:00:00Z", period_start: "2026-09-25T00:00:00Z" }),
      ],
    })
    expect(result.financial).toEqual({
      totalRevenue: 1000,
      totalPayroll: 100,
      netProfit: 900,
      profitMargin: 90,
      payrollAsPercentOfRevenue: 10,
    })
  })

  it("counts events: materialized only, upcoming after now, recent within thirty days", () => {
    const result = build({
      events: [
        event({ start: "2026-09-20T20:00:00Z" }),
        event({ start: "2026-08-01T20:00:00Z" }),
        event({ start: "2026-10-10T20:00:00Z", status: "PUBLISHED" }),
        event({ start: "2026-10-17T20:00:00Z", status: "PUBLISHED", id: null, materialized: false }),
      ],
    })
    expect(result.summary).toMatchObject({ total: 3, upcoming: 1, completed: 2, recentCount: 2 })
  })

  it("averages revenue per charted event", () => {
    const a = event({ start: "2026-09-20T20:00:00Z" })
    const b = event({ start: "2026-09-21T20:00:00Z" })
    const result = build({
      events: [a, b],
      rows: [row({ event_id: Number(a.id), amount: 100 }), row({ event_id: Number(b.id), amount: 151 })],
    })
    expect(result.summary.totalRevenue).toBe(251)
    expect(result.summary.avgRevenuePerEvent).toBe(126)
  })

  it("limits how many events are considered by period", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      event({ start: new Date(Date.UTC(2026, 8, 1 + (i % 28), 20 + (i > 27 ? 1 : 0))).toISOString() })
    )
    expect(build({ events }, "30d").summary.total).toBe(20)
    expect(build({ events }, "90d").summary.total).toBe(30)
  })
})
