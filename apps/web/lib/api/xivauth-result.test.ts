import { describe, it, expect } from "vitest"
import { describeXivAuthResult } from "./xivauth-result"

describe("describeXivAuthResult", () => {
  it("says nothing when the page was not reached from XIV Auth", () => {
    expect(describeXivAuthResult("")).toBeNull()
    expect(describeXivAuthResult("?tab=1")).toBeNull()
  })

  it("counts what happened", () => {
    expect(describeXivAuthResult("?xivauth=done&verified=2&transferred=1&conflicts=0")).toEqual({
      tone: "success",
      message: "Verified 3 characters. 1 was taken over from an account that had linked it without proof.",
    })
    expect(describeXivAuthResult("?xivauth=done&verified=1&transferred=0&conflicts=0")).toEqual({
      tone: "success",
      message: "Verified 1 character.",
    })
  })

  it("is an error when nothing could be verified", () => {
    expect(describeXivAuthResult("?xivauth=done&verified=0&transferred=0&conflicts=2")).toEqual({
      tone: "error",
      message: "None could be verified. 2 are already verified on another account.",
    })
  })

  it("explains each way the flow can stop", () => {
    expect(describeXivAuthResult("?xivauth=denied")?.message).toMatch(/did not allow/)
    expect(describeXivAuthResult("?xivauth=none")?.message).toMatch(/did not share any characters/)
    expect(describeXivAuthResult("?xivauth=state")?.message).toMatch(/expired/)
    expect(describeXivAuthResult("?xivauth=unavailable")?.message).toMatch(/not set up/)
    expect(describeXivAuthResult("?xivauth=error")?.tone).toBe("error")
    expect(describeXivAuthResult("?xivauth=whatever")?.tone).toBe("error")
  })
})
