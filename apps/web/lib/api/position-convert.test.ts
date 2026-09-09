import { describe, it, expect } from "vitest"
import {
  hexColorToInt,
  intColorToHex,
  dollarsToMinorUnits,
  minorUnitsToDollars,
  percentToBasisPoints,
  basisPointsToPercent,
} from "./position-convert"

describe("hexColorToInt", () => {
  it("converts a 6-digit hex string to its integer value", () => {
    expect(hexColorToInt("#6366f1")).toBe(0x6366f1)
  })

  it("handles hex without a leading #", () => {
    expect(hexColorToInt("6366f1")).toBe(0x6366f1)
  })

  it("returns null for null input", () => {
    expect(hexColorToInt(null)).toBeNull()
  })

  it("throws on an out-of-range or malformed hex string", () => {
    expect(() => hexColorToInt("#gggggg")).toThrow()
    expect(() => hexColorToInt("#1234567")).toThrow()
  })
})

describe("intColorToHex", () => {
  it("converts an integer back to a 6-digit hex string", () => {
    expect(intColorToHex(0x6366f1)).toBe("#6366f1")
  })

  it("pads short values with leading zeros", () => {
    expect(intColorToHex(255)).toBe("#0000ff")
  })

  it("returns null for null input", () => {
    expect(intColorToHex(null)).toBeNull()
  })
})

describe("dollarsToMinorUnits / minorUnitsToDollars round-trip", () => {
  it("converts a decimal dollar amount to integer cents and back", () => {
    expect(dollarsToMinorUnits(12.5)).toBe(1250)
    expect(minorUnitsToDollars(1250)).toBe(12.5)
  })

  it("returns null for null input on both directions", () => {
    expect(dollarsToMinorUnits(null)).toBeNull()
    expect(minorUnitsToDollars(null)).toBeNull()
  })

  it("rounds to the nearest cent instead of truncating", () => {
    expect(dollarsToMinorUnits(12.505)).toBe(1251)
  })
})

describe("percentToBasisPoints / basisPointsToPercent round-trip", () => {
  it("converts a percent to basis points and back", () => {
    expect(percentToBasisPoints(5)).toBe(500)
    expect(basisPointsToPercent(500)).toBe(5)
  })

  it("handles fractional percents", () => {
    expect(percentToBasisPoints(12.5)).toBe(1250)
    expect(basisPointsToPercent(1250)).toBe(12.5)
  })

  it("returns null for null input on both directions", () => {
    expect(percentToBasisPoints(null)).toBeNull()
    expect(basisPointsToPercent(null)).toBeNull()
  })

  it("rounds to the nearest basis point instead of truncating", () => {
    expect(percentToBasisPoints(12.505)).toBe(1251)
  })
})
