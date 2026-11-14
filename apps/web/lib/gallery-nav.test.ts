import { describe, expect, it } from "vitest"
import { stepIndex } from "./gallery-nav"

describe("stepIndex", () => {
  it("moves forward and back", () => {
    expect(stepIndex(1, 5, 1)).toBe(2)
    expect(stepIndex(3, 5, -1)).toBe(2)
  })

  it("wraps past either end", () => {
    expect(stepIndex(4, 5, 1)).toBe(0)
    expect(stepIndex(0, 5, -1)).toBe(4)
  })

  it("stays put with a single image", () => {
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, 1, -1)).toBe(0)
  })

  it("does not divide by zero on an empty gallery", () => {
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})
