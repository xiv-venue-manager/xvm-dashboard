import type { SalesVisibility } from "@/lib/api/xvm-api"
import type { VenueEvent } from "@/lib/sse/venue-events"

export interface StreamViewer {
  userId: string
  isManager: boolean
  salesVisibility: SalesVisibility
}

export function canReceiveEvent(viewer: StreamViewer, event: VenueEvent): boolean {
  if (event.type !== "sale") return true
  if (viewer.isManager || viewer.salesVisibility === "all") return true
  if (viewer.salesVisibility === "none") return false
  const staff = event.data.staff as { id?: unknown } | null | undefined
  return staff?.id === viewer.userId
}
