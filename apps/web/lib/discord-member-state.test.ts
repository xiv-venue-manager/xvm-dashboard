import { describe, it, expect } from "vitest"
import { memberLabel, unresolvedIds, MAX_RESOLVE, type DiscordMember } from "./discord-member-state"

const member = (over: Partial<DiscordMember> = {}): DiscordMember => ({
  id: "100",
  username: "bartender",
  displayName: "Bartender",
  avatarUrl: null,
  ...over,
})

describe("unresolvedIds", () => {
  it("asks for each id once, in order, dropping blanks and duplicates", () => {
    expect(unresolvedIds(["1", "", "2", "1"], new Set())).toEqual(["1", "2"])
  })

  it("never re-asks for an id already asked for, even when it resolved to nothing", () => {
    // The whole reason this is keyed on asked rather than found: getGuildMembers omits a member
    // who has left instead of reporting them, so "no name for this id" is permanent. Key it on
    // found and a table of departed entrants re-requests every one of them on every render.
    expect(unresolvedIds(["1", "2"], new Set(["1"]))).toEqual(["2"])
    expect(unresolvedIds(["1"], new Set(["1"]))).toEqual([])
  })

  it("caps a batch at what the route accepts, so nothing is silently dropped server-side", () => {
    const many = Array.from({ length: MAX_RESOLVE + 10 }, (_, i) => String(i + 1))
    expect(unresolvedIds(many, new Set())).toHaveLength(MAX_RESOLVE)
  })
})

describe("memberLabel", () => {
  it("prefers the member's display name", () => {
    expect(memberLabel("100", member({ displayName: "Mina" }))).toBe("Mina")
  })

  it("shortens an unresolved snowflake the way the contest tables already did", () => {
    expect(memberLabel("123456789012345678", undefined)).toBe("1234...5678")
  })

  it("returns a short id whole rather than padding it out", () => {
    // Shortening "123" would produce "123...123", which is longer than the thing it shortens.
    expect(memberLabel("123", undefined)).toBe("123")
  })
})
