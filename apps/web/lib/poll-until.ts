const DEFAULT_INTERVAL_MS = 2000
const DEFAULT_TIMEOUT_MS = 15000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PollUntilOptions {
  intervalMs?: number
  timeoutMs?: number
  /** Checked before each poll; return true to stop early without a match (e.g. component unmounted). */
  cancelled?: () => boolean
}

/**
 * Polls fetchList on an interval until an item satisfies predicate or timeoutMs elapses.
 * Returns the list containing the match, or null on timeout/cancellation.
 */
export async function pollUntil<T>(
  fetchList: () => Promise<T[]>,
  predicate: (item: T) => boolean,
  { intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, cancelled }: PollUntilOptions = {}
): Promise<T[] | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // Sleeps before every fetch, including the first - deliberate. The bot
    // needs a moment to act, so an immediate check would almost always miss
    // and waste a round trip.
    await sleep(intervalMs)
    if (cancelled?.()) return null
    const list = await fetchList()
    if (list.some(predicate)) return list
  }
  return null
}
