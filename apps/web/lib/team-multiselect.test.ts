import { describe, expect, it } from "vitest"
import { summarise, toggleValue } from "./team-multiselect"

const options = [
  { value: 1, label: "Developer" },
  { value: 2, label: "Tester" },
  { value: 3, label: "A very long community tester title" },
]

describe("toggleValue", () => {
  it("adds an id that is not selected", () => {
    expect(toggleValue([1], 2)).toEqual([1, 2])
  })

  it("removes an id that is selected", () => {
    expect(toggleValue([1, 2], 1)).toEqual([2])
  })

  it("never leaves a duplicate", () => {
    expect(toggleValue([1, 1, 2], 2)).toEqual([1])
    expect(toggleValue([1, 1], 3)).toEqual([1, 3])
  })
})

describe("summarise", () => {
  it("shows the placeholder when nothing is selected", () => {
    expect(summarise([], options, "Choose roles")).toBe("Choose roles")
  })

  it("joins short names with a comma", () => {
    expect(summarise([1, 2], options, "Choose roles")).toBe("Developer, Tester")
  })

  it("counts the roles when the names would be long", () => {
    expect(summarise([1, 2, 3], options, "Choose roles")).toBe("3 roles")
  })

  it("ignores ids that are not in the options", () => {
    expect(summarise([9], options, "Choose roles")).toBe("Choose roles")
  })
})
