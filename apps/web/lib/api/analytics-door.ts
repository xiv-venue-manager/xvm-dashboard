import { getVenueFollowers, listPatrons, type PatronLogRow, type PatronSummary } from "@/lib/api/xvm-api"
import { listAllPatronLogs } from "@/lib/api/patron-logs"
import type { PageEvent } from "@/lib/api/event-window"

export interface DoorInputs {
  logs: PatronLogRow[]
  patrons: PatronSummary[]
  followerCount: number
}

export interface DoorAnalytics {
  totalPatrons: number
  repeatRate: number
  patronByEvent: Array<{ eventId: string; eventTitle: string; startTime: Date; peakPatrons: number }>
  attendanceByHour: Array<{ time: string; avgCount: number }>
  busiestNights: Array<{ day: string; count: number; pct: number }>
  patronMix: { new: number; regular: number; vip: number; total: number; newPct: number; regularPct: number; vipPct: number }
  followers: { total: number; byMonth: Record<string, number> }
}

const PEAK_EVENTS = 7
const SLICE_MS = 15 * 60 * 1000
const MAX_SPAN_MS = 48 * 60 * 60 * 1000
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export async function fetchDoorInputs(token: string, xvmApiVenueId: string, events: PageEvent[]): Promise<DoorInputs> {
  const [logChunks, patrons, followers] = await Promise.all([
    Promise.all(events.map((event) => listAllPatronLogs(token, xvmApiVenueId, { eventId: Number(event.id), classification: "patron" }))),
    listPatrons(token, xvmApiVenueId),
    getVenueFollowers(token, xvmApiVenueId),
  ])
  return { logs: logChunks.flat(), patrons, followerCount: followers.count }
}

export function buildDoorAnalytics(inputs: DoorInputs, events: PageEvent[]): DoorAnalytics {
  const logsByEvent = new Map<number, PatronLogRow[]>()
  for (const log of inputs.logs) {
    if (log.was_working || log.event_id === null) continue
    const rows = logsByEvent.get(log.event_id)
    if (rows) rows.push(log)
    else logsByEvent.set(log.event_id, [log])
  }
  for (const rows of logsByEvent.values()) {
    rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime() || a.id - b.id)
  }
  const logsOf = (event: PageEvent) => logsByEvent.get(Number(event.id)) ?? []

  const patronByEvent = events
    .slice(0, PEAK_EVENTS)
    .reverse()
    .map((event) => {
      let current = 0
      let peak = 0
      for (const log of logsOf(event)) {
        current += log.count_change ?? 0
        peak = Math.max(peak, current)
      }
      return { eventId: event.id as string, eventTitle: event.title, startTime: event.startTime, peakPatrons: peak }
    })

  return {
    totalPatrons: patronByEvent.reduce((sum, event) => sum + event.peakPatrons, 0),
    patronByEvent,
    attendanceByHour: attendanceByHour(events, logsOf),
    busiestNights: busiestNights(inputs.logs.filter((log) => !log.was_working)),
    ...patronMix(inputs.patrons),
    followers: { total: inputs.followerCount, byMonth: {} },
  }
}

function attendanceByHour(events: PageEvent[], logsOf: (event: PageEvent) => PatronLogRow[]) {
  const trends: Record<string, { total: number; count: number }> = {}
  for (const event of events) {
    const logs = logsOf(event)
    if (logs.length === 0) continue

    const start = event.startTime
    const lastLog = new Date(logs[logs.length - 1].ts)
    const end = lastLog > event.endTime ? lastLog : event.endTime

    let time = new Date(start)
    let current = 0
    let index = 0
    while (time <= end) {
      while (index < logs.length && new Date(logs[index].ts) <= time) {
        current += logs[index].count_change ?? 0
        index++
      }
      if (current < 0) current = 0
      const key = time.toISOString().substring(11, 16)
      trends[key] = { total: (trends[key]?.total ?? 0) + current, count: (trends[key]?.count ?? 0) + 1 }
      time = new Date(time.getTime() + SLICE_MS)
      if (time.getTime() - start.getTime() > MAX_SPAN_MS) break
    }
  }
  return Object.entries(trends)
    .map(([time, data]) => ({ time, avgCount: Math.round(data.total / data.count) }))
    .sort((a, b) => a.time.localeCompare(b.time))
}

function busiestNights(logs: PatronLogRow[]) {
  const totals = new Array(7).fill(0)
  for (const log of logs) {
    if (log.count_change && log.count_change > 0) totals[new Date(log.ts).getUTCDay()]++
  }
  const max = Math.max(...totals, 1)
  return DAY_NAMES.map((day, i) => ({ day, count: totals[i], pct: Math.round((totals[i] / max) * 100) }))
}

function patronMix(patrons: PatronSummary[]) {
  const visitors = patrons.filter((patron) => patron.visits >= 1)
  const mixNew = visitors.filter((patron) => patron.visits <= 2).length
  const mixRegular = visitors.filter((patron) => patron.visits >= 3 && patron.visits <= 9).length
  const mixVip = visitors.filter((patron) => patron.visits >= 10).length
  const total = visitors.length || 1
  return {
    repeatRate: total > 1 ? Math.round(((mixRegular + mixVip) / total) * 100) : 0,
    patronMix: {
      new: mixNew,
      regular: mixRegular,
      vip: mixVip,
      total,
      newPct: Math.round((mixNew / total) * 100),
      regularPct: Math.round((mixRegular / total) * 100),
      vipPct: Math.round((mixVip / total) * 100),
    },
  }
}
