import { describe, it, expect } from "vitest"
import { mapSettings, type ExportedInventorySettings, type ExportedPotSettings } from "./settings"

const pot = (over: Partial<ExportedPotSettings> = {}): ExportedPotSettings => ({
  venueId: "v1",
  enabled: false,
  taxPercent: 0,
  includeSalesInPot: false,
  defaultTipPooled: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const inventory = (over: Partial<ExportedInventorySettings> = {}): ExportedInventorySettings => ({ venueId: "v1", enabled: false, ...over })

const run = (potRows: ExportedPotSettings[], inventoryRows: ExportedInventorySettings[] = [], venueIds: string[] = potRows.map((p) => p.venueId)) =>
  mapSettings({ pot: potRows, inventory: inventoryRows, venues: venueIds.map((id) => ({ id })) })

describe("pot settings", () => {
  it("maps the tax percent to basis points and keeps the two flags", () => {
    expect(run([pot({ taxPercent: 7.5, includeSalesInPot: true, defaultTipPooled: true })]).payrollSettings).toEqual([
      { venue_key: "v1", pot_enabled: false, tax_basis_points: 750, include_sales_in_pot: true, default_tip_pooled: true, auto_close_after_hours: null },
    ])
  })

  it("handles the ends of the range", () => {
    const r = run([pot({ venueId: "a", taxPercent: 15 }), pot({ venueId: "b", taxPercent: 100 }), pot({ venueId: "c", taxPercent: 0.01 })])
    expect(r.payrollSettings.map((s) => s.tax_basis_points)).toEqual([1500, 10000, 1])
  })

  it("rounds a tax that is not a whole number of basis points", () => {
    expect(run([pot({ taxPercent: 12.345 })]).payrollSettings[0].tax_basis_points).toBe(1235)
  })

  it("skips a tax outside 0 to 100 but still gives the venue a default row", () => {
    const r = run([pot({ venueId: "a", taxPercent: 120 }), pot({ venueId: "b", taxPercent: -1 })])
    expect(r.payrollSettings.map((s) => [s.venue_key, s.tax_basis_points])).toEqual([["a", 0], ["b", 0]])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b"])
  })

  it("makes a row with auto-close off for every venue, including ones with default or no pot settings", () => {
    const r = run([pot({ venueId: "a" }), pot({ venueId: "b", taxPercent: 5 })], [], ["a", "b", "c"])
    expect(r.payrollSettings).toEqual([
      { venue_key: "a", pot_enabled: false, tax_basis_points: 0, include_sales_in_pot: false, default_tip_pooled: false, auto_close_after_hours: null },
      { venue_key: "b", pot_enabled: false, tax_basis_points: 500, include_sales_in_pot: false, default_tip_pooled: false, auto_close_after_hours: null },
      { venue_key: "c", pot_enabled: false, tax_basis_points: 0, include_sales_in_pot: false, default_tip_pooled: false, auto_close_after_hours: null },
    ])
  })

  it("carries the pot switch on each venue's row, including ones that are otherwise default", () => {
    const r = run([pot({ venueId: "a", enabled: true }), pot({ venueId: "b", enabled: true, taxPercent: 5 }), pot({ venueId: "c" })], [], ["a", "b", "c", "d"])
    expect(r.payrollSettings.map((s) => [s.venue_key, s.pot_enabled])).toEqual([["a", true], ["b", true], ["c", false], ["d", false]])
    expect(r.warnings).toEqual([])
    expect("potEnabledVenues" in r).toBe(false)
  })

  it("keeps the pot switch on a venue whose tax is skipped", () => {
    const r = run([pot({ venueId: "a", enabled: true, taxPercent: 120 })])
    expect(r.payrollSettings).toEqual([
      { venue_key: "a", pot_enabled: true, tax_basis_points: 0, include_sales_in_pot: false, default_tip_pooled: false, auto_close_after_hours: null },
    ])
    expect(r.skipped.map((s) => s.key)).toEqual(["a"])
  })

  it("keeps the first of two rows for one venue", () => {
    const r = run([pot({ taxPercent: 5 }), pot({ taxPercent: 9 })])
    expect(r.payrollSettings).toHaveLength(1)
    expect(r.skipped).toEqual([{ key: "v1", reason: "second pot settings row for the same venue" }])
  })
})

describe("inventory settings", () => {
  it("turns an enabled venue into an inventory module toggle and leaves the rest off", () => {
    const r = run([], [inventory({ venueId: "a", enabled: true }), inventory({ venueId: "b" })])
    expect(r.modules).toEqual([{ venue_key: "a", module: "inventory", enabled: true }])
  })

  it("keeps the first of two rows for one venue", () => {
    const r = run([], [inventory({ enabled: true }), inventory({ enabled: false })])
    expect(r.modules).toHaveLength(1)
    expect(r.skipped).toEqual([{ key: "v1", reason: "second inventory settings row for the same venue" }])
  })
})
