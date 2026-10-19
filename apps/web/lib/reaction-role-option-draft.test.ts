import { describe, it, expect } from "vitest"
import { addInOrder, draftProblem, MAX_PANEL_OPTIONS } from "./reaction-role-option-draft"

const draft = { roleId: "123456789012345678", label: "Gamer", emoji: "" }

describe("draftProblem", () => {
  it("accepts a role with a label or an emoji", () => {
    expect(draftProblem(draft, [])).toBeNull()
    expect(draftProblem({ ...draft, label: "", emoji: "🎮" }, [])).toBeNull()
  })

  it("refuses a bad role id, an empty button, a repeat and a full panel", () => {
    expect(draftProblem({ ...draft, roleId: "abc" }, [])).toMatch(/numeric/)
    expect(draftProblem({ ...draft, label: " ", emoji: "" }, [])).toMatch(/label or an emoji/)
    expect(draftProblem(draft, [draft.roleId])).toMatch(/already on this panel/)
    const full = Array.from({ length: MAX_PANEL_OPTIONS }, (_, i) => String(i + 1))
    expect(draftProblem(draft, full)).toMatch(/at most 20/)
  })
})

describe("addInOrder", () => {
  it("adds in order and reports the ones that failed without stopping", async () => {
    const calls: number[] = []
    const result = await addInOrder([1, 2, 3, 4], async (n) => {
      calls.push(n)
      if (n === 2) throw new Error("The panel already offers that role")
      if (n === 4) throw "not an Error"
      return n * 10
    })
    expect(calls).toEqual([1, 2, 3, 4])
    expect(result.created).toEqual([10, 30])
    expect(result.failed).toEqual([
      { item: 2, error: "The panel already offers that role" },
      { item: 4, error: "Failed to add option." },
    ])
  })
})
