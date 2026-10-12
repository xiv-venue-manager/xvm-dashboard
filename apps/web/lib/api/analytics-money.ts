import { listFinanceTransactions, listPayrollChunked, type FinanceTransactionRow, type PayrollEntryRow } from "@/lib/api/xvm-api"
import { listEventsInRange, type PageEvent } from "@/lib/api/event-window"
import { minorUnitsToGil } from "@/lib/api/position-convert"

export type AnalyticsPeriod = "30d" | "90d" | "all"

export interface MoneyInputs {
  events: PageEvent[]
  rows: FinanceTransactionRow[]
  payroll: PayrollEntryRow[]
}

export interface MoneyAnalytics {
  summary: {
    total: number
    upcoming: number
    completed: number
    recentCount: number
    totalRevenue: number
    avgRevenuePerEvent: number
    avgSpend: number
    totalTransactions: number
  }
  financial: {
    totalRevenue: number
    totalPayroll: number
    netProfit: number
    profitMargin: number
    payrollAsPercentOfRevenue: number
  }
  revenueByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: Date
    revenue: number
    payroll: number
    netProfit: number
  }>
  serviceRevenue: Array<{ name: string; revenue: number }>
}

const DAY_MS = 24 * 60 * 60 * 1000
const CHUNK_MS = 59 * DAY_MS
const ALL_PERIOD_DAYS = 365
const FUTURE_DAYS = 59
const CHART_EVENTS = 10
const DOOR_EVENTS = 20

const periodDays = (period: AnalyticsPeriod) => (period === "all" ? ALL_PERIOD_DAYS : period === "90d" ? 90 : 30)
const eventLimit = (period: AnalyticsPeriod) => (period === "all" ? 100 : period === "90d" ? 40 : 20)

const startOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

export async function fetchMoneyInputs(
  token: string,
  xvmApiVenueId: string,
  period: AnalyticsPeriod,
  now: Date
): Promise<MoneyInputs> {
  const from = new Date(now.getTime() - periodDays(period) * DAY_MS)

  const windows: Array<{ from: Date; to: Date }> = []
  for (let start = from.getTime(); start < now.getTime(); start += CHUNK_MS) {
    windows.push({ from: new Date(start), to: new Date(Math.min(start + CHUNK_MS, now.getTime())) })
  }

  const [events, rowChunks, payroll] = await Promise.all([
    listEventsInRange(token, xvmApiVenueId, from, new Date(now.getTime() + FUTURE_DAYS * DAY_MS), {
      includeCancelled: true,
      now,
    }),
    Promise.all(
      windows.map((window) =>
        listFinanceTransactions(token, xvmApiVenueId, { from: window.from.toISOString(), to: window.to.toISOString() })
      )
    ),
    listPayrollChunked(token, xvmApiVenueId, { from: from.toISOString(), to: now.toISOString(), isPaid: true }),
  ])

  const rows = new Map<number, FinanceTransactionRow>()
  for (const row of rowChunks.flat()) rows.set(row.id, row)
  return { events, rows: [...rows.values()], payroll }
}

export function recentEvents(inputs: Pick<MoneyInputs, "events">, period: AnalyticsPeriod): PageEvent[] {
  return inputs.events
    .filter((event) => event.id !== null)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, eventLimit(period))
}

export function recentDoorEvents(inputs: Pick<MoneyInputs, "events">, period: AnalyticsPeriod): PageEvent[] {
  return recentEvents(inputs, period)
    .filter((event) => event.status === "COMPLETED" || event.status === "ACTIVE")
    .slice(0, DOOR_EVENTS)
}

export function buildMoneyAnalytics(inputs: MoneyInputs, period: AnalyticsPeriod, now: Date): MoneyAnalytics {
  const events = recentEvents(inputs, period)
  const revenueRows = inputs.rows.filter((row) => row.entry_type === "revenue" && row.status === "posted")
  const paid = inputs.payroll.filter((entry) => entry.is_paid)

  const charted = events
    .filter((event) => event.status === "COMPLETED" || event.status === "ACTIVE")
    .slice(0, CHART_EVENTS)
    .reverse()

  const revenueByEvent = charted.map((event) => {
    const revenue = minorUnitsToGil(
      revenueRows.filter((row) => row.event_id === Number(event.id)).reduce((sum, row) => sum + row.amount, 0)
    ) ?? 0
    const eventDay = startOfDay(event.startTime)
    const payroll = paid
      .filter(
        (entry) => eventDay >= startOfDay(new Date(entry.period_start)) && eventDay <= startOfDay(new Date(entry.period_end))
      )
      .reduce((sum, entry) => sum + (minorUnitsToGil(entry.total_amount_minor) ?? 0), 0)
    return {
      eventId: event.id as string,
      eventTitle: event.title,
      startTime: event.startTime,
      revenue,
      payroll,
      netProfit: revenue - payroll,
    }
  })

  const services = new Map<string, number>()
  for (const row of revenueRows) {
    if (row.service_name) services.set(row.service_name, (services.get(row.service_name) ?? 0) + row.amount)
  }
  const serviceRevenue = [...services.entries()]
    .map(([name, minor]) => ({ name, revenue: minorUnitsToGil(minor) ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const totalRevenue = revenueByEvent.reduce((sum, event) => sum + event.revenue, 0)
  const rowsRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0)

  const recentFrom = now.getTime() - 30 * DAY_MS
  const summary = {
    total: events.length,
    upcoming: events.filter((event) => event.startTime > now).length,
    completed: events.filter((event) => event.status === "COMPLETED").length,
    recentCount: events.filter((event) => event.startTime.getTime() >= recentFrom).length,
    totalRevenue,
    avgRevenuePerEvent: revenueByEvent.length > 0 ? Math.round(totalRevenue / revenueByEvent.length) : 0,
    avgSpend: revenueRows.length > 0 ? Math.round((minorUnitsToGil(rowsRevenue) ?? 0) / revenueRows.length) : 0,
    totalTransactions: revenueRows.length,
  }

  return { summary, financial: financialSpan(charted, revenueRows, paid), revenueByEvent, serviceRevenue }
}

function financialSpan(charted: PageEvent[], revenueRows: FinanceTransactionRow[], paid: PayrollEntryRow[]) {
  if (charted.length === 0) {
    return { totalRevenue: 0, totalPayroll: 0, netProfit: 0, profitMargin: 0, payrollAsPercentOfRevenue: 0 }
  }
  const from = charted[0].startTime.getTime()
  const to = charted[charted.length - 1].endTime.getTime()
  const totalRevenue =
    minorUnitsToGil(
      revenueRows
        .filter((row) => new Date(row.created_at).getTime() >= from && new Date(row.created_at).getTime() <= to)
        .reduce((sum, row) => sum + row.amount, 0)
    ) ?? 0
  const totalPayroll =
    minorUnitsToGil(
      paid
        .filter((entry) => new Date(entry.period_end).getTime() >= from && new Date(entry.period_end).getTime() <= to)
        .reduce((sum, entry) => sum + entry.total_amount_minor, 0)
    ) ?? 0
  const netProfit = totalRevenue - totalPayroll
  return {
    totalRevenue,
    totalPayroll,
    netProfit,
    profitMargin: totalRevenue === 0 ? 0 : (netProfit / totalRevenue) * 100,
    payrollAsPercentOfRevenue: totalRevenue === 0 ? 0 : (totalPayroll / totalRevenue) * 100,
  }
}
