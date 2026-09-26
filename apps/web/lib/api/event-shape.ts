import type { EventItem, EventRow, EventSeriesCreateData } from "@/lib/api/xvm-api"
import { deriveEventStatus, type EventStatus } from "@/lib/api/event-status"
import type { RecurrenceRule } from "@/lib/recurrence"

export interface DashboardEvent {
  id: string | null
  materialized: boolean
  title: string
  description: string | null
  eventType: string
  status: EventStatus
  startTime: string
  endTime: string
  timezone: string
  location: string | null
  imageUrl: string | null
  partakeEventId: number | null
  recurrenceRuleId: number | null
  cancelReason: string | null
  createdBy: { name: string; image: null } | null
  attendanceCount: null
  partakeAttendeeCount: null
  revenue: null
}

export function toDashboardEventShape(
  event: EventItem | EventRow,
  options: { now?: Date; creatorName?: string | null } = {}
): DashboardEvent {
  const row = "created_by_person_id" in event ? event : null
  return {
    id: event.id === null ? null : String(event.id),
    materialized: "materialized" in event ? event.materialized : true,
    title: event.title,
    description: event.description,
    eventType: event.event_type ?? "OTHER",
    status: deriveEventStatus(event, options.now),
    startTime: event.starts_at,
    endTime: event.ends_at,
    timezone: "UTC",
    location: event.location,
    imageUrl: event.image_url,
    partakeEventId: row?.partake_event_id ?? null,
    recurrenceRuleId: event.recurrence_rule_id,
    cancelReason: event.cancel_reason,
    createdBy: options.creatorName ? { name: options.creatorName, image: null } : null,
    attendanceCount: null,
    partakeAttendeeCount: null,
    revenue: null,
  }
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

function localParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: Number(parts.day),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday],
  }
}

export function toSeriesCreateData(
  base: Pick<EventSeriesCreateData, "title" | "description" | "event_type" | "location" | "publish">,
  rule: RecurrenceRule,
  startTime: Date,
  endTime: Date,
  timeZone = "UTC"
): EventSeriesCreateData {
  const local = localParts(startTime, timeZone)
  const common = {
    ...base,
    start_minute_of_day: local.minuteOfDay,
    duration_minutes: Math.round((endTime.getTime() - startTime.getTime()) / 60000),
    timezone: timeZone,
    anchor_date: local.date,
  }
  if (rule === "MONTHLY") {
    return { ...common, interval: "monthly_by_date", day_of_month: local.day }
  }
  return {
    ...common,
    interval: rule === "WEEKLY" ? "weekly" : "biweekly",
    weekday: local.weekday,
  }
}

export type StatusChange =
  | { action: "none" }
  | { action: "publish" }
  | { action: "cancel" }
  | { action: "reject"; message: string }

export function planStatusChange(current: EventStatus, desired: EventStatus | undefined): StatusChange {
  if (desired === undefined || desired === current) return { action: "none" }
  if (desired === "PUBLISHED") {
    if (current === "DRAFT") return { action: "publish" }
    if (current === "ACTIVE" || current === "COMPLETED") return { action: "none" }
  }
  if (desired === "CANCELLED") return { action: "cancel" }
  return {
    action: "reject",
    message: `Status can't be set to ${desired}. It follows from publishing, cancelling and the event times.`,
  }
}
