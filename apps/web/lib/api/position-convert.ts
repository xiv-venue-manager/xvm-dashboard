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

// xvm-api's tax_basis_points is an int (100 = 1%); the dashboard UI and Prisma's
// VenuePotSettings.taxPercent both use a 0-100 percent. Round rather than truncate
// for the same reason as dollarsToMinorUnits: a fractional basis point from float
// math shouldn't silently shave precision off the stored rate.
export function percentToBasisPoints(percent: number | null): number | null {
  if (percent === null) return null
  return Math.round(percent * 100)
}

export function basisPointsToPercent(basisPoints: number | null): number | null {
  if (basisPoints === null) return null
  return basisPoints / 100
}
