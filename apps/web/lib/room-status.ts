export function roomStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "disabled":
      return { label: "Disabled", className: "neutral" }
    case "locked":
      return { label: "Locked", className: "warning" }
    case "reserved":
      return { label: "Reserved", className: "danger" }
    case "available":
      return { label: "Available", className: "vip" }
    default:
      return { label: status, className: "neutral" }
  }
}

export type RoomFilter = "all" | "available" | "reserved" | "locked" | "disabled"

export const ROOM_FILTERS: ReadonlyArray<{ id: RoomFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "reserved", label: "Reserved" },
  { id: "locked", label: "Locked" },
  { id: "disabled", label: "Disabled" },
]

export function filterRooms<T extends { status: string }>(rooms: T[], filter: RoomFilter): T[] {
  return filter === "all" ? rooms : rooms.filter((room) => room.status === filter)
}

export const canReserve = (status: string) => status === "available"

export const canRelease = (status: string) => status === "reserved"
