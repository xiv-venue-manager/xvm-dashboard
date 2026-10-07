import { describe, it, expect } from "vitest"
import { toCharacterShape } from "./character-shape"

describe("toCharacterShape", () => {
  it("maps an xvm-api character to the shape the characters page reads", () => {
    expect(toCharacterShape({ id: 7, character_name: "Test Char", world: "Lich", is_primary: true })).toEqual({
      id: "7",
      characterName: "Test Char",
      world: "Lich",
      isPrimary: true,
    })
  })

  it("keeps the id a string, which is what the page declares", () => {
    expect(typeof toCharacterShape({ id: 3 } as never).id).toBe("string")
  })
})
