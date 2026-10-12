import { describe, expect, it } from "vitest"
import { addressProblem } from "./venue-location"

const house = { district: "Mist", ward: 12, plot: 7 }
const apartment = { district: "Goblet", ward: 3, apartment: 14, subdivision: false }

describe("addressProblem", () => {
  it("accepts a house and an apartment with everything filled in", () => {
    expect(addressProblem(house)).toBeNull()
    expect(addressProblem(apartment)).toBeNull()
    expect(addressProblem({ ...apartment, subdivision: true })).toBeNull()
  })

  it.each([
    ["no district", { ...house, district: null }],
    ["a blank district", { ...house, district: "" }],
    ["a district that is not one of the five", { ...house, district: "The Lavender Beds" }],
  ])("rejects %s", (_name, v) => {
    expect(addressProblem(v)).toMatch(/district/i)
  })

  it("rejects a missing ward", () => {
    expect(addressProblem({ ...house, ward: null })).toMatch(/ward/i)
  })

  it("rejects an address with neither a plot nor an apartment", () => {
    expect(addressProblem({ district: "Mist", ward: 12 })).toMatch(/plot or an apartment/i)
  })

  it("rejects an address with both a plot and an apartment", () => {
    expect(addressProblem({ ...house, apartment: 4, subdivision: false })).toMatch(/plot or an apartment/i)
  })

  it("rejects an apartment that does not say main or subdivision", () => {
    expect(addressProblem({ district: "Goblet", ward: 3, apartment: 14 })).toMatch(/main|subdivision/i)
    expect(addressProblem({ district: "Goblet", ward: 3, apartment: 14, subdivision: null })).toMatch(/main|subdivision/i)
  })
})
