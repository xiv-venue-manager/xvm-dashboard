import { describe, expect, it } from "vitest"
import { sortByName } from "./sort-by-name"

const named = (...names: string[]) => names.map((name, id) => ({ id, name }))

describe("sortByName", () => {
  it("sorts alphabetically, ignoring case", () => {
    expect(sortByName(named("banana", "Apple", "cherry")).map((x) => x.name)).toEqual(["Apple", "banana", "cherry"])
  })

  it("puts 2 before 10", () => {
    expect(sortByName(named("Room 10", "Room 2", "Room 1")).map((x) => x.name)).toEqual(["Room 1", "Room 2", "Room 10"])
  })

  it("keeps the original order for equal names", () => {
    expect(sortByName(named("Ale", "ale", "ALE")).map((x) => x.id)).toEqual([0, 1, 2])
  })

  it("does not change the list it was given", () => {
    const input = named("b", "a")
    sortByName(input)
    expect(input.map((x) => x.name)).toEqual(["b", "a"])
  })
})
