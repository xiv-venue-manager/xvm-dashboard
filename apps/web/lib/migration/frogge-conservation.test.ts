import { describe, expect, it } from "vitest"
import {
  checkFrogge,
  checkFroggeTables,
  FROGGE_NOT_CARRIED,
  FROGGE_RELATIONS,
  FROGGE_TABLES,
  type FroggeInputs,
} from "./frogge-conservation"

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, channel_id: "c" }))

function inputs(): FroggeInputs {
  const staffing: Record<string, unknown> = {}
  const features: Record<string, unknown> = {}
  for (const r of FROGGE_RELATIONS) (r.file === "staffing" ? staffing : features)[r.array] = rows(2)
  for (const n of FROGGE_NOT_CARRIED) (n.file === "staffing" ? staffing : features)[n.array] = rows(1)
  const counts: Record<string, number> = {}
  const mapped: Record<string, unknown[]> = {}
  for (const r of FROGGE_RELATIONS)
    r.carried.forEach((term, i) => {
      const n = i === 0 ? 2 : 0
      if (term.from === "features" || term.from === "tools") mapped[term.key] = rows(n)
      else if ("key" in term) counts[term.key] = n
    })
  return {
    exports: { staffing, features },
    reports: { staffing: { counts, dropped: [], matchedVenues: [] }, features: { counts: {} }, tools: { counts } },
    mapped: { features: mapped, tools: mapped },
  }
}

describe("checkFrogge", () => {
  it("accepts a clean run", () => {
    const base = inputs()
    expect(checkFrogge(base).problems).toEqual([])
  })

  it("fails when carried rows are fewer than exported ones, until accepted", () => {
    const base = inputs()
    base.reports.staffing!.counts!["event positions created"] = 1
    expect(checkFrogge(base).problems).toEqual([expect.stringContaining("event_positions: 1 rows not carried")])
    expect(checkFrogge(base, { "frogge:event_positions": 1 }).problems).toEqual([])
  })

  it("counts a mapper drop against the array it came from, until accepted", () => {
    const base = inputs()
    base.reports.staffing!.counts!["shifts created"] = 1
    base.reports.staffing!.dropped = [{ what: "signup" }]
    expect(checkFrogge(base).problems).toEqual([expect.stringContaining("event_signups: 1 rows not carried")])
    expect(checkFrogge(base, { "frogge:event_signups": 1 }).problems).toEqual([])
  })

  it("fails an array nobody has decided, and a missing mapper output", () => {
    const base = inputs()
    ;(base.exports.features as Record<string, unknown>).brand_new_table = rows(3)
    base.mapped.tools = undefined
    const problems = checkFrogge(base).problems
    expect(problems).toContainEqual(expect.stringContaining("brand_new_table"))
    expect(problems).toContainEqual(expect.stringContaining("mapper output for it is missing"))
  })
})

describe("checkFroggeTables", () => {
  const empty = { staffing: {}, features: {} }
  const counts = (extra: Record<string, number> = {}) => ({
    tables: {
      ...Object.fromEntries(
        Object.entries(FROGGE_TABLES)
          .filter(([, s]) => s.kind === "expect_empty")
          .map(([t]) => [t, 0])
      ),
      ...extra,
    },
  })

  it("fails a table nobody has decided", () => {
    expect(checkFroggeTables(counts({ brand_new: 4 }), empty).problems).toEqual([
      expect.stringContaining("brand_new: a Frogge table nobody has decided"),
    ])
  })

  it("fails a table that should be empty but has rows", () => {
    expect(checkFroggeTables(counts({ quotes: 2 }), empty).problems).toEqual([
      expect.stringContaining("quotes: expected empty and has 2 rows"),
    ])
  })

  it("passes a table carried by decision and flags an undecided one that has rows", () => {
    expect(checkFroggeTables(counts({ activity_logs: 500 }), empty).problems).toEqual([])
    expect(checkFroggeTables(counts({ finance_transactions: 1 }), empty).problems).toEqual([
      expect.stringContaining("no decision yet"),
    ])
    expect(checkFroggeTables(counts({ finance_transactions: 0 }), empty).problems).toEqual([])
  })

  it("fails an export with more rows than the table has, or a missing array", () => {
    const some = { staffing: { staff_members: [1, 2, 3] }, features: {} }
    expect(checkFroggeTables(counts({ staff_members: 2 }), some).problems).toEqual([
      expect.stringContaining("more than exist"),
    ])
    expect(checkFroggeTables(counts({ staff_members: 5 }), empty).problems).toEqual([
      expect.stringContaining("not in the export"),
    ])
  })

  it("lists every relation and not-carried array under a known table", () => {
    const names = new Set(Object.values(FROGGE_TABLES).flatMap((s) => (s.kind === "exported" ? [s.array] : [])))
    for (const r of FROGGE_RELATIONS) expect(names.has(r.array)).toBe(true)
  })
})
