export interface SaleEventOption {
  id: string
  title: string
  status: string
  startTime: string
}

export const RECENT_SALE_EVENT_LIMIT = 10

interface EventInput {
  id: string | null
  title: string
  status: string
  startTime: string
}

const byStart = (a: SaleEventOption, b: SaleEventOption) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()

export function pickSaleEvents(events: EventInput[]): { live: SaleEventOption | null; recent: SaleEventOption[] } {
  const withId = events.filter((e): e is SaleEventOption => e.id !== null)
  const live = withId.filter((e) => e.status === "ACTIVE").sort(byStart).pop() ?? null
  const recent = withId
    .filter((e) => (e.status === "ACTIVE" || e.status === "COMPLETED") && e.id !== live?.id)
    .sort((a, b) => byStart(b, a))
    .slice(0, RECENT_SALE_EVENT_LIMIT)
  return { live, recent }
}
