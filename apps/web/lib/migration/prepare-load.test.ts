import { describe, it, expect } from "vitest"
import { prepareLoad, type MappedFiles } from "./prepare-load"

const fixture = (): MappedFiles => ({
  venues: { venues: [{ key: "v1" }], externalLinks: [{ venue_key: "v1" }, { venue_key: "vTest" }], images: [] },
  events: {
    rules: [{ key: "r1", venue_key: "v1" }],
    events: [{ key: "e1", venue_key: "v1" }, { key: "e2", venue_key: "vTest" }],
    totals: [{ event_key: "e1" }, { event_key: "e2" }],
  },
  shifts: {
    rules: [],
    shifts: [
      { key: "s1", venue_key: "v1", payroll_entry_key: "p1" },
      { key: "s2", venue_key: "v1", payroll_entry_key: "p-dropped" },
      { key: "s3", venue_key: "v1", payroll_entry_key: null },
      { key: "s4", venue_key: "vTest", payroll_entry_key: null },
    ],
    audits: [{ shift_key: "s1" }, { shift_key: "s4" }],
    event_positions: [
      { key: "ep1", venue_key: "v1", event_key: "e1" },
      { key: "ep2", venue_key: "vTest", event_key: "e2" },
      { key: "ep3", venue_key: "v1", event_key: "e-gone" },
    ],
    event_shifts: [
      { key: "es1", venue_key: "v1", event_position_key: "ep1" },
      { key: "es2", venue_key: "vTest", event_position_key: "ep2" },
      { key: "es3", venue_key: "v1", event_position_key: "ep3" },
    ],
  },
  finance: { transactions: [], payroll: [{ key: "p1", venue_key: "v1" }, { key: "p2", venue_key: "vTest" }] },
  positions: {
    positions: [],
    memberships: [{ key: "m1", venue_key: "v1" }, { key: "m2", venue_key: "vTest" }],
    membershipPositions: [{ membership_key: "m1" }, { membership_key: "m2" }],
  },
  services: {
    categories: [],
    services: [{ key: "sv1", venue_key: "v1" }, { key: "sv2", venue_key: "vTest" }],
    servicePositions: [{ service_key: "sv1" }, { service_key: "sv2" }],
    inventories: [{ service_key: "sv2" }],
  },
})

describe("prepareLoad", () => {
  it("drops rows for venues that do not load, and their children", () => {
    const { files, report } = prepareLoad(fixture())
    expect(files.venues.externalLinks).toEqual([{ venue_key: "v1" }])
    expect(files.events.events).toEqual([{ key: "e1", venue_key: "v1" }])
    expect(files.events.totals).toEqual([{ event_key: "e1" }])
    expect(files.shifts.audits).toEqual([{ shift_key: "s1" }])
    expect(files.positions.membershipPositions).toEqual([{ membership_key: "m1" }])
    expect(files.services.servicePositions).toEqual([{ service_key: "sv1" }])
    expect(files.services.inventories).toEqual([])
    expect(report.dropped).toMatchObject({
      "venues.externalLinks": 1,
      "events.events": 1,
      "events.totals": 1,
      "shifts.shifts": 1,
      "shifts.audits": 1,
      "finance.payroll": 1,
      "positions.memberships": 1,
      "positions.membershipPositions": 1,
      "services.services": 1,
      "services.servicePositions": 1,
      "services.inventories": 1,
    })
  })

  it("drops a left-out venue's event positions and event shifts, and anything under a dropped parent", () => {
    const { files, report } = prepareLoad(fixture())
    expect((files.shifts.event_positions as { key: string }[]).map((r) => r.key)).toEqual(["ep1"])
    expect((files.shifts.event_shifts as { key: string }[]).map((r) => r.key)).toEqual(["es1"])
    expect(report.dropped).toMatchObject({ "shifts.event_positions": 2, "shifts.event_shifts": 2 })
  })

  it("clears a shift's payroll link only when the entry is gone", () => {
    const { files, report } = prepareLoad(fixture())
    const byKey = Object.fromEntries((files.shifts.shifts as { key: string; payroll_entry_key: string | null }[]).map((s) => [s.key, s.payroll_entry_key]))
    expect(byKey).toEqual({ s1: "p1", s2: null, s3: null })
    expect(report.clearedPayrollLinks).toBe(1)
  })

  it("does not mutate its input", () => {
    const input = fixture()
    const before = JSON.stringify(input)
    prepareLoad(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it("refuses to run without the venues file", () => {
    expect(() => prepareLoad({})).toThrow(/venues-mapped/)
  })
})
