export type EventStatus = "DRAFT" | "PUBLISHED" | "ACTIVE" | "COMPLETED" | "CANCELLED"

export interface EventStatusInput {
  starts_at: string
  ends_at: string
  published_at: string | null
  cancelled_at: string | null
}

export function deriveEventStatus(event: EventStatusInput, now: Date = new Date()): EventStatus {
  if (event.cancelled_at) return "CANCELLED"
  if (!event.published_at) return "DRAFT"
  // Depends on xvm-api sending offset-aware datetimes: new Date() reads a string without an offset as local time.
  const at = now.getTime()
  if (at < new Date(event.starts_at).getTime()) return "PUBLISHED"
  if (at <= new Date(event.ends_at).getTime()) return "ACTIVE"
  return "COMPLETED"
}
