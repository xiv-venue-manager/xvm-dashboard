import { describe, expect, it } from "vitest"
import { groupTeam, initials, TEAM_BIO_MAX } from "./team-groups"

const member = (name: string, group: string) => ({
  name,
  roles: ["Role"],
  group,
  bio: null,
  photo_url: null,
  photo_x: 0.5,
  photo_y: 0.5,
  photo_zoom: 1,
})

describe("groupTeam", () => {
  it("returns no sections for an empty team", () => {
    expect(groupTeam([])).toEqual([])
  })

  it("groups by name in the order each group first appears", () => {
    const sections = groupTeam([
      member("A", "Builders"),
      member("B", "Testers"),
      member("C", "Builders"),
    ])
    expect(sections.map((s) => s.name)).toEqual(["Builders", "Testers"])
    expect(sections[0].members.map((m) => m.name)).toEqual(["A", "C"])
    expect(sections[1].members.map((m) => m.name)).toEqual(["B"])
  })
})

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Name Surname")).toBe("NS")
    expect(initials("  ada   king  lovelace ")).toBe("AL")
  })

  it("takes one letter from a single word", () => {
    expect(initials("ehno")).toBe("E")
  })

  it("does not split a character outside the basic plane", () => {
    expect(initials("\u{1D4D0}da")).toBe("\u{1D4D0}")
  })

  it("falls back to a question mark for a blank name", () => {
    expect(initials("   ")).toBe("?")
  })
})

describe("TEAM_BIO_MAX", () => {
  it("matches the ceiling xvm-api enforces", () => {
    expect(TEAM_BIO_MAX).toBe(1000)
  })
})
