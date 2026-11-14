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

export const canReserve = (status: string) => status === "available"

export const canRelease = (status: string) => status === "reserved"
