import { describe, it, expect } from "vitest"
import { readVisibility } from "./visibility-settings"

describe("readVisibility", () => {
  it("reads the three fields when present", () => {
    expect(
      readVisibility({ taskVisibility: "assigned", salesVisibility: "none", eventVisibility: "published" })
    ).toEqual({ taskVisibility: "assigned", salesVisibility: "none", eventVisibility: "published" })
  })

  it("is unavailable when the response is flagged degraded, even if keys are present", () => {
    expect(
      readVisibility({
        visibilityDegraded: true,
        taskVisibility: "all",
        salesVisibility: "all",
        eventVisibility: "all",
      })
    ).toBeNull()
  })

  it("is unavailable for a degraded response that omits the keys, which is what the route sends", () => {
    expect(readVisibility({ visibilityDegraded: true, tagline: "hi" })).toBeNull()
  })

  it("is unavailable when a value is not one the setting allows", () => {
    expect(readVisibility({ taskVisibility: "everyone", salesVisibility: "all", eventVisibility: "all" })).toBeNull()
    expect(readVisibility({ taskVisibility: "all", salesVisibility: null, eventVisibility: "all" })).toBeNull()
  })

  it("keeps the old default for an unconnected venue whose settings lack the keys", () => {
    expect(readVisibility({ tagline: "hi" })).toEqual({
      taskVisibility: "all",
      salesVisibility: "all",
      eventVisibility: "all",
    })
  })
})
