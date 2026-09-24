import { describe, it, expect } from "vitest"
import {
  hexColorToInt,
  intColorToHex,
  gilToMinorUnits,
  minorUnitsToGil,
  hoursToMinutes,
  minutesToHours,
  formatHours,
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

describe("gilToMinorUnits / minorUnitsToGil round-trip", () => {
  it("converts a decimal dollar amount to integer cents and back", () => {
    expect(gilToMinorUnits(12.5)).toBe(1250)
    expect(minorUnitsToGil(1250)).toBe(12.5)
  })

  it("returns null for null input on both directions", () => {
    expect(gilToMinorUnits(null)).toBeNull()
    expect(minorUnitsToGil(null)).toBeNull()
  })

  it("rounds to the nearest cent instead of truncating", () => {
    expect(gilToMinorUnits(12.505)).toBe(1251)
  })
})

describe("hoursToMinutes / minutesToHours round-trip", () => {
  it("converts decimal hours to whole minutes and back", () => {
    expect(hoursToMinutes(1.5)).toBe(90)
    expect(minutesToHours(90)).toBe(1.5)
  })

  it("returns null for null input on both directions", () => {
    expect(hoursToMinutes(null)).toBeNull()
    expect(minutesToHours(null)).toBeNull()
  })

  it("rounds to the nearest minute instead of truncating", () => {
    expect(hoursToMinutes(1.008)).toBe(60) // 1.008h = 60.48min -> rounds to 60
    expect(hoursToMinutes(1.01)).toBe(61) // 1.01h = 60.6min -> rounds to 61
  })
})

describe("formatHours", () => {
  it("rounds a repeating-decimal float to 2 places, e.g. 140 minutes worth of hours", () => {
    expect(formatHours(minutesToHours(140))).toBe("2.33") // 2.3333333333333335 unrounded
  })

  it("doesn't pad a whole number with trailing zeros", () => {
    expect(formatHours(2)).toBe("2")
  })

  it("returns an em dash for null input", () => {
    expect(formatHours(null)).toBe("—")
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
