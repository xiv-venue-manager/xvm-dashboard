import { describe, it, expect } from "vitest"
import { mapServices, type ExportedService } from "./services"

const service = (over: Partial<ExportedService> = {}): ExportedService => ({
  id: "s1",
  venueId: "v1",
  name: "House Cocktail",
  description: null,
  price: 5000,
  category: null,
  isActive: true,
  linkedItemId: null,
  linkedItemName: null,
  linkedItemIcon: null,
  stockCount: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roleIds: [],
  ...over,
})

const positions = new Map([["r1", "v1"], ["r2", "v1"], ["far", "v2"]])
const run = (services: ExportedService[], map: ReadonlyMap<string, string> = positions) => mapServices({ services }, map)

describe("mapServices", () => {
  it("maps a service with its price in whole gil", () => {
    expect(run([service({ description: " A drink " })]).services).toEqual([
      {
        key: "s1", venue_key: "v1", category_key: null, name: "House Cocktail", description: "A drink",
        price_minor: 5000, is_active: true, created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
  })

  it("rounds a fractional price and says so", () => {
    const r = run([service({ price: 1250.5 })])
    expect(r.services[0].price_minor).toBe(1251)
    expect(r.warnings[0].message).toContain("rounded")
  })

  it("accepts a free service", () => {
    expect(run([service({ price: 0 })]).services[0].price_minor).toBe(0)
  })

  it("skips a negative price, a blank name and a name over 100 characters", () => {
    const r = run([
      service({ id: "a", price: -1 }),
      service({ id: "b", name: "  " }),
      service({ id: "c", name: "x".repeat(101) }),
    ])
    expect(r.services).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b", "c"])
  })

  it("keeps the earlier of two services that differ only by case at one venue", () => {
    const r = run([
      service({ id: "late", name: "house cocktail", createdAt: "2026-02-01T00:00:00.000Z" }),
      service({ id: "early" }),
      service({ id: "other", venueId: "v2", name: "HOUSE COCKTAIL" }),
    ])
    expect(r.services.map((s) => s.key)).toEqual(["early", "other"])
    expect(r.skipped[0].key).toBe("late")
  })
})

describe("categories", () => {
  it("makes one category per venue and name, ignoring case", () => {
    const r = run([
      service({ id: "a", name: "A", category: "Drinks" }),
      service({ id: "b", name: "B", category: " drinks " }),
      service({ id: "c", name: "C", category: "Drinks", venueId: "v2" }),
    ])
    expect(r.categories).toEqual([
      { key: "v1|drinks", venue_key: "v1", name: "Drinks" },
      { key: "v2|drinks", venue_key: "v2", name: "Drinks" },
    ])
    expect(r.services.map((s) => s.category_key)).toEqual(["v1|drinks", "v1|drinks", "v2|drinks"])
  })

  it("leaves a blank category as none", () => {
    expect(run([service({ category: "  " })]).services[0].category_key).toBeNull()
    expect(run([service({ category: "  " })]).categories).toEqual([])
  })

  it("cuts a category over 50 characters and warns", () => {
    const r = run([service({ category: "c".repeat(60) })])
    expect(r.categories[0].name).toHaveLength(50)
    expect(r.warnings).toHaveLength(1)
  })
})

describe("grants", () => {
  it("grants each position once", () => {
    const r = run([service({ roleIds: ["r1", "r2", "r1"] })])
    expect(r.servicePositions).toEqual([
      { service_key: "s1", position_key: "r1" },
      { service_key: "s1", position_key: "r2" },
    ])
  })

  it("reports a position that was not loaded or belongs to another venue", () => {
    const r = run([service({ roleIds: ["gone", "far"] })])
    expect(r.servicePositions).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(["position was not loaded", "position belongs to another venue"])
  })
})

describe("inventory", () => {
  it("maps a linked item with its stock count", () => {
    const r = run([service({ linkedItemId: 4526, linkedItemName: " Moonlit Mead ", linkedItemIcon: 20223, stockCount: 12 })])
    expect(r.inventories).toEqual([
      { service_key: "s1", linked_item_id: 4526, linked_item_name: "Moonlit Mead", linked_item_icon: 20223, stock_count: 12 },
    ])
  })

  it("keeps a linked item that is not counted", () => {
    expect(run([service({ linkedItemId: 4526 })]).inventories[0].stock_count).toBeNull()
  })

  it("drops a stock count with no linked item, and reports it", () => {
    const r = run([service({ stockCount: 3 })])
    expect(r.inventories).toEqual([])
    expect(r.services).toHaveLength(1)
    expect(r.skipped).toEqual([{ key: "s1:inventory", reason: "stock count without a linked item, xvm-api inventory needs an FFXIV item" }])
  })

  it("stores a negative stock count as not counted, with a warning", () => {
    const r = run([service({ linkedItemId: 1, stockCount: -2 })])
    expect(r.inventories[0].stock_count).toBeNull()
    expect(r.warnings[0].message).toContain("negative stock")
  })
})
