import { describe, expect, it } from "vitest"
import { stockLabel } from "./stock-label"

describe("stockLabel", () => {
  it("shows nothing for a service that does not track stock", () => {
    expect(stockLabel(null)).toBeNull()
  })

  it("shows how many are left", () => {
    expect(stockLabel(12)).toBe("12 left")
    expect(stockLabel(1)).toBe("1 left")
  })

  it("says out of stock at zero or below", () => {
    expect(stockLabel(0)).toBe("Out of stock")
    expect(stockLabel(-2)).toBe("Out of stock")
  })
})
