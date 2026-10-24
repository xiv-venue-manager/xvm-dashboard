import type { OpenNow } from "@/lib/api/xvm-api"

// What /api/public/venues reports about a venue's opening, from xvm-api's
// open_now. openSince and scheduledEnd come from the opening in progress (or,
// for scheduledEnd, tonight's next one). nextOpen keeps its "tonight" meaning:
// the next opening only if it starts before the end of the UTC day.
export function openingStatus(openNow: OpenNow | undefined, now: Date) {
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)
  const current = openNow?.current ?? null
  const next = openNow?.next ?? null
  const tonight = next !== null && new Date(next.starts_at) <= endOfDay ? next : null
  return {
    openSince: current?.starts_at ?? null,
    scheduledEnd: current?.ends_at ?? tonight?.ends_at ?? null,
    nextOpen: tonight?.starts_at ?? null,
  }
}
