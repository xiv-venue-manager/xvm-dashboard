// xvm-api's PositionModel.color is a Discord-style int (0 to 0xFFFFFF); Prisma's
// Role.color is the "#rrggbb" string every UI color picker in this app already uses.
export function hexColorToInt(hex: string | null): number | null {
  if (hex === null) return null
  const stripped = hex.startsWith("#") ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return parseInt(stripped, 16)
}

export function intColorToHex(value: number | null): string | null {
  if (value === null) return null
  return `#${value.toString(16).padStart(6, "0")}`
}

// xvm-api's hourly_rate_minor is an int in minor currency units (cents); Prisma's
// Role.hourlyRate is a Decimal in whole units. Round rather than truncate so a
// fractional cent from float math doesn't silently shave a cent off someone's rate.
export function dollarsToMinorUnits(dollars: number | null): number | null {
  if (dollars === null) return null
  return Math.round(dollars * 100)
}

export function minorUnitsToDollars(minor: number | null): number | null {
  if (minor === null) return null
  return minor / 100
}

// xvm-api's minutes_worked is an int; the dashboard's hoursWorked (and the shift-duration
// math it comes from) is decimal hours. Round rather than truncate, same reasoning as the
// other minor-unit conversions here — a fractional minute from float math shouldn't
// silently shave time off someone's paid hours.
export function hoursToMinutes(hours: number | null): number | null {
  if (hours === null) return null
  return Math.round(hours * 60)
}

export function minutesToHours(minutes: number | null): number | null {
  if (minutes === null) return null
  return minutes / 60
}

// minutesToHours is exact division, not currency-rounded like the pair above - most
// minute totals aren't a clean multiple of 60, so the raw float (e.g. 2.3333333333333335
// for 140 minutes) isn't fit to display as-is. Round for display only; nothing here
// should feed back into a money computation.
export function formatHours(hours: number | null): string {
  if (hours === null) return "—"
  return (Math.round(hours * 100) / 100).toString()
}
