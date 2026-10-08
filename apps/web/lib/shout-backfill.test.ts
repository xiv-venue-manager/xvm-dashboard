import { describe, it, expect } from "vitest"
import { planBackfill, type ExportedShout } from "@/lib/shout-backfill"

function row(overrides: Partial<ExportedShout> = {}): ExportedShout {
  return {
    discord_id: "1001",
    display_name: "Alice",
    label: "Friday Night",
    fields: { venue: "The Pearl" },
    template_id: "classic",
    separator_id: "dots",
    decor_id: "stars",
    ...overrides,
  }
}

describe("planBackfill", () => {
  it("groups one person's shouts together in export order", () => {
    const plan = planBackfill([row({ label: "A" }), row({ discord_id: "1002", display_name: "Bob", label: "B" }), row({ label: "C" })])
    expect(plan.problems).toEqual([])
    expect(plan.people.map((p) => [p.discordId, p.shouts.map((s) => s.label)])).toEqual([
      ["1001", ["A", "C"]],
      ["1002", ["B"]],
    ])
  })

  it("maps columns onto xvm-api's shout body, leaving null ids unset", () => {
    const [person] = planBackfill([row({ separator_id: null, decor_id: null })]).people
    expect(person.shouts[0]).toEqual({
      label: "Friday Night",
      fields: { venue: "The Pearl" },
      template_id: "classic",
      separator_id: undefined,
      decor_id: undefined,
    })
  })

  it("reports a shout whose owner has no Discord account instead of dropping it", () => {
    const plan = planBackfill([row({ discord_id: null, label: "Orphan" })])
    expect(plan.people).toEqual([])
    expect(plan.problems).toEqual([{ discordId: null, label: "Orphan", reason: "no_discord_account" }])
  })

  it("reports a blank label, which xvm-api would refuse", () => {
    const plan = planBackfill([row({ label: "   " })])
    expect(plan.people).toEqual([])
    expect(plan.problems).toEqual([{ discordId: "1001", label: "", reason: "blank_label" }])
  })

  it("keeps the first of two labels that differ only by case or padding and reports the rest", () => {
    const plan = planBackfill([row({ label: "Friday Night" }), row({ label: " friday night " }), row({ label: "Saturday" })])
    expect(plan.people[0].shouts.map((s) => s.label)).toEqual(["Friday Night", "Saturday"])
    expect(plan.problems).toEqual([{ discordId: "1001", label: "friday night", reason: "duplicate_label" }])
  })

  it("lets two different people hold the same label", () => {
    const plan = planBackfill([row(), row({ discord_id: "1002", display_name: "Bob" })])
    expect(plan.problems).toEqual([])
    expect(plan.people).toHaveLength(2)
  })

  it("falls back to a placeholder display name", () => {
    const [person] = planBackfill([row({ display_name: null })]).people
    expect(person.displayName).toBe("Unknown")
  })
})
