import { describe, it, expect } from "vitest"
import { batches, memberLabel, unresolvedIds, MAX_RESOLVE, type DiscordMember } from "./discord-member-state"

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

  it("returns every unasked id, however many, rather than trimming to one request", () => {
    // It used to cap here, which read as politeness to the route and was a silent drop: the
    // effect that calls this only re-runs when the id list changes, so the overflow was never
    // asked for at all. The cap belongs at the request, which is what `batches` is for.
    const many = Array.from({ length: MAX_RESOLVE + 10 }, (_, i) => String(i + 1))
    expect(unresolvedIds(many, new Set())).toHaveLength(MAX_RESOLVE + 10)
  })
})

describe("batches", () => {
  it("splits a list too long for one request, keeping every id and its order", () => {
    const many = Array.from({ length: MAX_RESOLVE + 10 }, (_, i) => String(i + 1))
    const split = batches(many, MAX_RESOLVE)
    expect(split.map((batch) => batch.length)).toEqual([MAX_RESOLVE, 10])
    expect(split.flat()).toEqual(many)
  })

  it("adds no empty remainder on an exact multiple", () => {
    expect(batches(["1", "2", "3", "4"], 2)).toEqual([["1", "2"], ["3", "4"]])
  })

  it("sends one request for a list that fits in one", () => {
    expect(batches(["1", "2"], MAX_RESOLVE)).toEqual([["1", "2"]])
  })

  it("has nothing to send for an empty list", () => {
    expect(batches([], MAX_RESOLVE)).toEqual([])
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
