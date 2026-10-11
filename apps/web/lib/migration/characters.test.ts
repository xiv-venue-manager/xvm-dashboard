import { describe, it, expect } from "vitest"
import { mapCharacters, type ExportedCharacter } from "./characters"

const character = (over: Partial<ExportedCharacter> = {}): ExportedCharacter => ({
  id: "c1",
  userId: "u1",
  characterName: "Ash Vale",
  world: "Twintania",
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const people = new Set(["u1", "u2"])
const run = (characters: ExportedCharacter[], keys: ReadonlySet<string> = people) => mapCharacters({ characters }, keys)

describe("mapCharacters", () => {
  it("maps a character as self declared", () => {
    expect(run([character()]).characters).toEqual([
      { person_key: "u1", character_name: "Ash Vale", world: "Twintania", is_primary: true, verified_via: "self_declared" },
    ])
  })

  it("collapses whitespace in the name and world", () => {
    const r = run([character({ characterName: "  Ash   Vale ", world: " Twintania " })])
    expect(r.characters[0].character_name).toBe("Ash Vale")
    expect(r.characters[0].world).toBe("Twintania")
  })

  it("skips a character whose person is not loaded", () => {
    const r = run([character({ userId: "ghost" })])
    expect(r.characters).toEqual([])
    expect(r.skipped).toEqual([{ key: "c1", reason: "person not loaded" }])
  })

  it("skips a blank name or world", () => {
    const r = run([character({ id: "a", characterName: "  " }), character({ id: "b", world: "" })])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b"])
  })

  it("skips a name or world over 32 characters instead of cutting it", () => {
    const r = run([character({ characterName: "x".repeat(33) })])
    expect(r.characters).toEqual([])
    expect(r.skipped[0].reason).toContain("32")
  })

  it("keeps the earlier of two characters that differ only by case", () => {
    const r = run([
      character({ id: "late", userId: "u2", characterName: "ash vale", world: "TWINTANIA", createdAt: "2026-03-01T00:00:00.000Z" }),
      character({ id: "early", userId: "u1", createdAt: "2026-01-01T00:00:00.000Z" }),
    ])
    expect(r.characters.map((c) => c.person_key)).toEqual(["u1"])
    expect(r.skipped).toEqual([{ key: "late", reason: "same name and world as an earlier character, ignoring case" }])
  })

  it("keeps the same name on a different world", () => {
    const r = run([character({ id: "a" }), character({ id: "b", userId: "u2", world: "Lich" })])
    expect(r.characters).toHaveLength(2)
  })

  it("makes the oldest character primary when a person has none", () => {
    const r = run([
      character({ id: "old", characterName: "Old One", isPrimary: false, createdAt: "2026-01-01T00:00:00.000Z" }),
      character({ id: "new", characterName: "New One", isPrimary: false, createdAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(r.characters.map((c) => [c.character_name, c.is_primary])).toEqual([["Old One", true], ["New One", false]])
    expect(r.warnings).toEqual([{ key: "u1", message: "no primary character, made the oldest one primary" }])
  })

  it("keeps only the oldest primary when a person has several", () => {
    const r = run([
      character({ id: "a", characterName: "First", isPrimary: true, createdAt: "2026-01-01T00:00:00.000Z" }),
      character({ id: "b", characterName: "Second", isPrimary: true, createdAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(r.characters.map((c) => c.is_primary)).toEqual([true, false])
    expect(r.warnings[0].message).toContain("2 primary")
  })

  it("does not let a skipped duplicate stand as someone's primary", () => {
    const r = run([
      character({ id: "a", userId: "u1", isPrimary: false, createdAt: "2026-01-01T00:00:00.000Z" }),
      character({ id: "b", userId: "u2", isPrimary: true, createdAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(r.characters.map((c) => [c.person_key, c.is_primary])).toEqual([["u1", true]])
    expect(r.skipped).toEqual([{ key: "b", reason: "same name and world as an earlier character, ignoring case" }])
  })
})
