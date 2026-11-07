import { describe, expect, it } from "vitest"
import { checkFrogge, FROGGE_NOT_CARRIED, FROGGE_RELATIONS, type FroggeInputs } from "./frogge-conservation"

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
