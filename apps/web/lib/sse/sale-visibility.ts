import type { RevenueVisibility, SalesVisibility } from "@/lib/api/xvm-api"
import type { VenueEvent } from "@/lib/sse/venue-events"

export interface StreamViewer {
  userId: string
  isManager: boolean
  salesVisibility: SalesVisibility
  revenueVisibility: RevenueVisibility
}

export function canReceiveEvent(viewer: StreamViewer, event: VenueEvent): boolean {
  if (event.type !== "sale") return true
  if (viewer.isManager || viewer.salesVisibility === "all") return true
  if (viewer.salesVisibility === "none") return false
  const staff = event.data.staff as { id?: unknown } | null | undefined
  return staff?.id === viewer.userId
}

export function outgoingEvent(viewer: StreamViewer, event: VenueEvent): VenueEvent | null {
  if (canReceiveEvent(viewer, event)) return event
  const staff = event.data.staff as { id?: unknown } | null | undefined
  const own = staff?.id === viewer.userId
  if (viewer.revenueVisibility === "all" || (viewer.revenueVisibility === "own" && own)) {
    return { id: event.id, type: "sale_total", venueId: event.venueId, timestamp: event.timestamp, data: { amount: event.data.amount, own } }
  }
  return null
}
