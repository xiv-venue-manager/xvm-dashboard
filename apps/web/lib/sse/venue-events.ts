import { EventEmitter } from "events"

// In-memory pub/sub for venue timeline events.
// Single-container deployment - no Redis needed.

export interface VenueEvent {
  id: string
  type: "sale" | "sale_total" | "patron_enter" | "patron_exit" | "room_status"
  venueId: string
  timestamp: string
  data: Record<string, unknown>
}

class VenueEventBus extends EventEmitter {
  emit(venueId: string, event: VenueEvent): boolean {
    return super.emit(venueId, event)
  }

  subscribe(venueId: string, listener: (event: VenueEvent) => void): () => void {
    this.on(venueId, listener)
    return () => this.off(venueId, listener)
  }
}

// Singleton - survives across hot reloads in dev via globalThis
const globalBus = globalThis as unknown as { __venueEventBus?: VenueEventBus }
export const venueEventBus = (globalBus.__venueEventBus ??= new VenueEventBus())
venueEventBus.setMaxListeners(200)
