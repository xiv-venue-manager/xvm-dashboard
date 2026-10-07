import { listPatronLogs, type PatronLogRow } from "@/lib/api/xvm-api"

// 199, not 200: xvm-api caps a page at 200, and sitting exactly on the cap means every page 422s the moment it tightens by one
const LOG_PAGE = 199
const MAX_PAGES = 50

type PatronLogScope = { from: string; to: string } | { eventId: number }

export async function listAllPatronLogs(
  token: string,
  xvmApiVenueId: string,
  filter: PatronLogScope & { classification?: "staff" | "patron" }
): Promise<PatronLogRow[]> {
  const rows: PatronLogRow[] = []
  let before: number | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await listPatronLogs(token, xvmApiVenueId, { ...filter, before, limit: LOG_PAGE })
    rows.push(...batch)
    if (batch.length < LOG_PAGE) break
    before = batch[batch.length - 1].id
  }
  return rows
}
