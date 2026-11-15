import { describe, it, expect } from "vitest"
import { isGroupOpen, parseChoices, withChoice } from "./sidebar-groups"

describe("parseChoices", () => {
  it("reads a saved object and keeps only true or false entries", () => {
    expect(parseChoices('{"Discord":false,"Records":true,"Odd":"yes","Num":1}')).toEqual({ Discord: false, Records: true })
  })

  it("gives nothing for empty, broken or non-object storage", () => {
    expect(parseChoices("")).toEqual({})
    expect(parseChoices("{oops")).toEqual({})
    expect(parseChoices("[true]")).toEqual({})
    expect(parseChoices("null")).toEqual({})
    expect(parseChoices('"Discord"')).toEqual({})
  })
})

describe("isGroupOpen", () => {
  it("opens only the group holding the active page when nothing was chosen", () => {
    expect(isGroupOpen({}, "Discord", true)).toBe(true)
    expect(isGroupOpen({}, "Records", false)).toBe(false)
  })

  it("lets a choice win over the active page either way", () => {
    expect(isGroupOpen({ Discord: false }, "Discord", true)).toBe(false)
    expect(isGroupOpen({ Records: true }, "Records", false)).toBe(true)
  })
})

describe("withChoice", () => {
  it("adds a choice and keeps the others", () => {
    expect(parseChoices(withChoice('{"Discord":false}', "Records", true))).toEqual({ Discord: false, Records: true })
  })

  it("replaces an earlier choice and recovers from broken storage", () => {
    expect(parseChoices(withChoice('{"Discord":false}', "Discord", true))).toEqual({ Discord: true })
    expect(parseChoices(withChoice("{oops", "Discord", false))).toEqual({ Discord: false })
  })
})
