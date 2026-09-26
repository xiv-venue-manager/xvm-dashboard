import { listFinanceTransactions } from "@/lib/api/xvm-api"
import { minorUnitsToGil } from "@/lib/api/position-convert"

const HOUR_MS = 60 * 60 * 1000
const MAX_WINDOW_MS = 59 * 24 * HOUR_MS

export async function eventRevenueGil(
  token: string,
  xvmApiVenueId: string,
  event: { id: string; startTime: Date; endTime: Date }
): Promise<number> {
  const from = new Date(event.startTime.getTime() - 6 * HOUR_MS)
  const to = new Date(Math.min(event.endTime.getTime() + 12 * HOUR_MS, from.getTime() + MAX_WINDOW_MS))
  const rows = await listFinanceTransactions(token, xvmApiVenueId, {
    from: from.toISOString(),
    to: to.toISOString(),
    eventId: Number(event.id),
  })
  const minor = rows.filter((r) => r.entry_type === "revenue").reduce((sum, r) => sum + r.amount, 0)
  return minorUnitsToGil(minor) ?? 0
}
