import { listEvents, materializeEvent } from "@/lib/api/xvm-api"
import { toDashboardEventShape, type DashboardEvent } from "@/lib/api/event-shape"

// 59, not 60: xvm-api's list-window cap is 60 days, and this chunk width is sent
// straight through as one request's from/to - landing exactly on the cap means every
// chunk 400s the moment the cap tightens by even a day. Mirrors EVENT_LIST_WINDOW_MS
// in xvm-api.ts (#99); duplicated here rather than imported since that PR hasn't
// merged yet - collapse to one shared constant once it has.
const LIST_WINDOW_MS = 59 * 24 * 60 * 60 * 1000

export interface PageEvent extends Omit<DashboardEvent, "startTime" | "endTime"> {
  startTime: Date
  endTime: Date
}

export const toPageEvent = (event: DashboardEvent): PageEvent => ({
  ...event,
  startTime: new Date(event.startTime),
  endTime: new Date(event.endTime),
})

const eventKey = (event: DashboardEvent) => event.id ?? `${event.recurrenceRuleId}-${event.startTime}`

export async function listEventsInRange(
  token: string,
  xvmApiVenueId: string,
  from: Date,
  to: Date,
  options: { includeCancelled?: boolean; now?: Date } = {}
): Promise<PageEvent[]> {
  const windows: Array<{ from: Date; to: Date }> = []
  for (let start = from.getTime(); start < to.getTime(); start += LIST_WINDOW_MS) {
    windows.push({ from: new Date(start), to: new Date(Math.min(start + LIST_WINDOW_MS, to.getTime())) })
  }

  const pages = await Promise.all(
    windows.map((window) =>
      listEvents(token, xvmApiVenueId, {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        includeCancelled: options.includeCancelled,
      })
    )
  )

  const seen = new Map<string, DashboardEvent>()
  for (const item of pages.flat()) {
    const event = toDashboardEventShape(item, { now: options.now })
    seen.set(eventKey(event), event)
  }

  return [...seen.values()]
    .map(toPageEvent)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

export async function findLiveEventId(
  token: string,
  xvmApiVenueId: string,
  now: Date = new Date()
): Promise<number | null> {
  const events = await listEventsInRange(
    token,
    xvmApiVenueId,
    new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    { now }
  )
  // Events sort by start, so pop() takes the latest-starting ACTIVE event on purpose when two overlap
  const live = events.filter((e) => e.status === "ACTIVE" && e.id !== null).pop()
  return live ? Number(live.id) : null
}

export async function materializeIfVirtual(token: string, xvmApiVenueId: string, event: PageEvent): Promise<PageEvent> {
  if (event.id !== null || event.recurrenceRuleId === null || event.scheduledAt === null) return event
  const row = await materializeEvent(token, xvmApiVenueId, {
    recurrence_rule_id: event.recurrenceRuleId,
    scheduled_at: event.scheduledAt,
  })
  return toPageEvent(toDashboardEventShape(row))
}
