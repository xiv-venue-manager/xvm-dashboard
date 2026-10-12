export const FFXIV_DISTRICTS = ["Goblet", "Mist", "Lavender Beds", "Shirogane", "Empyreum"] as const

export type FfxivDistrict = (typeof FFXIV_DISTRICTS)[number]

export function isDistrict(value: unknown): value is FfxivDistrict {
  return typeof value === "string" && (FFXIV_DISTRICTS as readonly string[]).includes(value)
}

export interface VenueLocationFields {
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
  apartment?: number | null
}

/** Returns a formatted "Datacenter · World · District · W# · P#/Apt#" string. */
export function formatVenueAddress(v: VenueLocationFields): string {
  const parts: string[] = [v.dataCenter, v.world]

  if (v.district) parts.push(v.district)
  if (v.ward != null) parts.push(`W${v.ward}`)
  if (v.plot != null) parts.push(`P${v.plot}`)
  else if (v.apartment != null) parts.push(`Apt${v.apartment}`)

  return parts.join(" · ")
}

/** Pasteable Lifestream `/li` teleport command, e.g. "/li Cactuar Lavender Beds W1 P1". Falls back to the display address if the venue has no structured plot data to build a valid command from. */
export function formatLifestreamCommand(v: VenueLocationFields): string {
  if (!v.district || v.ward == null || (v.plot == null && v.apartment == null)) {
    return formatVenueAddress(v)
  }
  const plotPart = v.plot != null ? `P${v.plot}` : `A${v.apartment}`
  return `/li ${v.world} ${v.district} W${v.ward} ${plotPart}`
}

/** Short location string (district + ward + plot/apartment only, no DC/world). */
export function formatVenueLocationShort(
  v: Pick<VenueLocationFields, "district" | "ward" | "plot" | "apartment">
): string | null {
  return (
    [
      v.district ?? null,
      v.ward != null ? `W${v.ward}` : null,
      v.plot != null ? `P${v.plot}` : v.apartment != null ? `Apt${v.apartment}` : null,
    ]
      .filter(Boolean)
      .join(" ") || null
  )
}

export interface VenueAddressInput {
  district?: string | null
  ward?: number | null
  plot?: number | null
  apartment?: number | null
  subdivision?: boolean | null
}

/** Why an address cannot identify a house or apartment, or null when it can. */
export function addressProblem(v: VenueAddressInput): string | null {
  if (!isDistrict(v.district)) return "Choose a district."
  if (v.ward == null) return "Enter a ward."
  const hasPlot = v.plot != null
  const hasApartment = v.apartment != null
  if (hasPlot === hasApartment) return "Enter either a plot or an apartment."
  if (hasApartment && v.subdivision == null) return "Say whether the apartment is in the main or the subdivision building."
  return null
}
