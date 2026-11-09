import { listFinanceTransactions, type FinanceTransactionKind, type FinanceTransactionRow } from "@/lib/api/xvm-api"

const DAY_MS = 24 * 60 * 60 * 1000
const LIST_WINDOW_MS = 59 * DAY_MS
export const MAX_TRANSACTION_RANGE_MS = 24 * LIST_WINDOW_MS

export async function listTransactionsInRange(
  token: string,
  xvmApiVenueId: string,
  from: Date,
  to: Date,
  kind?: FinanceTransactionKind
): Promise<FinanceTransactionRow[]> {
  const windows: Array<{ from: Date; to: Date }> = []
  for (let end = to.getTime(); end > from.getTime(); end -= LIST_WINDOW_MS) {
    windows.push({ from: new Date(Math.max(end - LIST_WINDOW_MS, from.getTime())), to: new Date(end) })
  }

  const pages = await Promise.all(
    windows.map((window) =>
      listFinanceTransactions(token, xvmApiVenueId, {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        kind,
      })
    )
  )

  const seen = new Set<number>()
  return pages.flat().filter((row) => !seen.has(row.id) && seen.add(row.id))
}
