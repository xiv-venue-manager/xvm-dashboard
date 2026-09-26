import type { EventItem } from "@/lib/api/xvm-api"

export interface ShiftEventOption {
  id: string
  name: string
  startsAt: string
}

export function toShiftEventOptions(items: EventItem[]): ShiftEventOption[] {
  return items
    .filter((item): item is EventItem & { id: number } => item.id !== null)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((item) => ({ id: String(item.id), name: item.title, startsAt: item.starts_at }))
}

export function shiftEventIdField(eventId: string): { eventId?: number } {
  return eventId ? { eventId: Number(eventId) } : {}
}
