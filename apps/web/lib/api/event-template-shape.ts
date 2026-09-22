import type { EventTemplateRow } from "@/lib/api/xvm-api"

export const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function hhmmFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function toDashboardTemplateShape(t: EventTemplateRow) {
  return {
    id: String(t.id),
    name: t.name,
    title: t.title,
    description: t.description,
    eventType: t.event_type,
    defaultStartTime: hhmmFromMinutes(t.default_start_minute_of_day),
    defaultEndTime: hhmmFromMinutes(t.default_start_minute_of_day + t.default_duration_minutes),
    // xvm-api's templates don't track who created them - no data to show here.
    createdBy: null,
  }
}
