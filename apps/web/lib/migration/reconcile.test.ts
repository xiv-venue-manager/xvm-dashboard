import { describe, it, expect } from "vitest"
import { checkReferences } from "./reconcile"
import { prepareLoad, type MappedFiles } from "./prepare-load"

const files = (): MappedFiles => ({
  people: { people: [{ key: "p1" }] },
  venues: { venues: [{ key: "v1" }] },
  positions: { positions: [], memberships: [{ key: "m1", venue_key: "v1", person_key: "p1" }], membershipPositions: [] },
  shifts: {
    rules: [],
    shifts: [{ key: "s1", venue_key: "v1", membership_key: "m1", approved_by_person_key: "p1", payroll_entry_key: null }],
    audits: [{ shift_key: "s1", actor_person_key: "p1" }],
  },
})

describe("checkReferences", () => {
  it("passes when every key resolves", () => {
    expect(checkReferences(files())).toEqual([])
  })

  it("reports a venue, a person and a payroll link that point nowhere", () => {
    const f = files()
    ;(f.shifts.shifts as Record<string, unknown>[])[0] = { key: "s1", venue_key: "gone", membership_key: "m1", approved_by_person_key: "ghost", payroll_entry_key: "p-x" }
    const found = checkReferences(f).map((d) => `${d.where}.${d.field}`).sort()
    expect(found).toEqual(["shifts.shifts.approved_by_person_key", "shifts.shifts.payroll_entry_key", "shifts.shifts.venue_key"])
  })

  it("reports event positions, event shifts and shifts whose references point nowhere", () => {
    const f = files()
    f.events = { events: [{ key: "e1", venue_key: "v1" }] }
    f.positions = { ...f.positions, positions: [{ key: "pos1", venue_key: "v1" }] }
    f.shifts = {
      event_positions: [{ key: "ep1", venue_key: "v1", event_key: "gone-event", position_key: "gone-position" }],
      event_shifts: [{ key: "es1", venue_key: "v1", event_position_key: "gone-ep" }],
      shifts: [{ key: "s1", venue_key: "v1", membership_key: "m1", event_shift_key: "gone-es", payroll_entry_key: null }],
      audits: [],
    }
    const found = checkReferences(f).map((d) => `${d.where}.${d.field}`).sort()
    expect(found).toEqual([
      "shifts.event_positions.event_key",
      "shifts.event_positions.position_key",
      "shifts.event_shifts.event_position_key",
      "shifts.shifts.event_shift_key",
    ])
  })

  it("passes after prepareLoad drops a venue that does not load", () => {
    const f = files()
    ;(f.shifts.shifts as Record<string, unknown>[]).push({ key: "s2", venue_key: "vTest", membership_key: null, payroll_entry_key: null })
    ;(f.shifts.audits as Record<string, unknown>[]).push({ shift_key: "s2", actor_person_key: null })
    expect(checkReferences(f).length).toBeGreaterThan(0)
    const { files: prepared } = prepareLoad(f)
    expect(checkReferences({ ...f, ...prepared })).toEqual([])
  })
})
