export interface ExportedPotSettings {
  venueId: string
  enabled: boolean
  taxPercent: number
  includeSalesInPot: boolean
  defaultTipPooled: boolean
  updatedAt: string
}

export interface ExportedInventorySettings {
  venueId: string
  enabled: boolean
}

export interface SettingsExport {
  venues: { id: string }[]
  pot: ExportedPotSettings[]
  inventory: ExportedInventorySettings[]
}

export interface PayrollSettingsRow {
  venue_key: string
  tax_basis_points: number
  include_sales_in_pot: boolean
  default_tip_pooled: boolean
  auto_close_after_hours: null
}

export interface ModuleRow {
  venue_key: string
  module: "inventory"
  enabled: true
}

export interface SettingsResult {
  payrollSettings: PayrollSettingsRow[]
  modules: ModuleRow[]
  potEnabledVenues: string[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_BASIS_POINTS = 10000

export function mapSettings(source: SettingsExport): SettingsResult {
  const result: SettingsResult = { payrollSettings: [], modules: [], potEnabledVenues: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const seenPot = new Set<string>()

  for (const p of [...source.pot].sort((a, b) => a.venueId.localeCompare(b.venueId))) {
    if (seenPot.has(p.venueId)) {
      skip(p.venueId, "second pot settings row for the same venue")
      continue
    }
    seenPot.add(p.venueId)

    const basisPoints = Math.round(p.taxPercent * 100)
    if (basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) {
      skip(p.venueId, `tax of ${p.taxPercent}% is outside 0 to 100`)
      continue
    }
    if (p.enabled) result.potEnabledVenues.push(p.venueId)

    result.payrollSettings.push({
      venue_key: p.venueId,
      tax_basis_points: basisPoints,
      include_sales_in_pot: p.includeSalesInPot,
      default_tip_pooled: p.defaultTipPooled,
      auto_close_after_hours: null,
    })
  }

  const hasRow = new Set(result.payrollSettings.map((s) => s.venue_key))
  for (const id of new Set([...source.venues.map((v) => v.id), ...seenPot])) {
    if (hasRow.has(id)) continue
    result.payrollSettings.push({
      venue_key: id,
      tax_basis_points: 0,
      include_sales_in_pot: false,
      default_tip_pooled: false,
      auto_close_after_hours: null,
    })
  }
  result.payrollSettings.sort((a, b) => a.venue_key.localeCompare(b.venue_key))

  const seenInventory = new Set<string>()
  for (const i of [...source.inventory].sort((a, b) => a.venueId.localeCompare(b.venueId))) {
    if (seenInventory.has(i.venueId)) {
      skip(i.venueId, "second inventory settings row for the same venue")
      continue
    }
    seenInventory.add(i.venueId)
    if (i.enabled) result.modules.push({ venue_key: i.venueId, module: "inventory", enabled: true })
  }

  if (result.potEnabledVenues.length > 0) {
    warn("pot", `${result.potEnabledVenues.length} venues had the pot switched on, which has no column in xvm-api, listed in potEnabledVenues`)
  }
  return result
}
