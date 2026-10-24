import type { PublicEvent, PublicEvents } from "@/lib/api/xvm-api"

const TONIGHT_BEFORE_MS = 30 * 60 * 1000
const TONIGHT_AFTER_MS = 8 * 60 * 60 * 1000

// "Tonight" is an event starting within the next 8 hours, or one that started
// up to 30 minutes ago and has not been marked live yet.
export function tonightEvents(events: PublicEvents | undefined, now: Date) {
  const live = events?.live ?? null
  const from = now.getTime() - TONIGHT_BEFORE_MS
  const to = now.getTime() + TONIGHT_AFTER_MS
  const upcoming: PublicEvent | null =
    (events?.upcoming ?? []).find((e) => {
      const start = new Date(e.starts_at).getTime()
      return start >= from && start <= to
    }) ?? null
  return { live, upcoming }
}
