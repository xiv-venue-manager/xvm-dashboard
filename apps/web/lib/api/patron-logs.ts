import { listPatronLogs, type PatronLogRow } from "@/lib/api/xvm-api"

const LOG_PAGE = 200
const MAX_PAGES = 50

export async function listAllPatronLogs(
  token: string,
  xvmApiVenueId: string,
  filter: { from?: string; to?: string; eventId?: number; classification?: "staff" | "patron" }
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
