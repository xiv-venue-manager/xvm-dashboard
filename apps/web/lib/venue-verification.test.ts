import { describe, it, expect } from "vitest"
import { verificationWarnings, type VerificationSettings } from "./venue-verification"

const off: VerificationSettings = {
  verifiedRoleId: null,
  verificationCaptcha: false,
  verificationLodestone: "off",
  verificationNickname: false,
}

describe("verificationWarnings", () => {
  it("says verification does nothing when nothing is on", () => {
    expect(verificationWarnings(off)).toEqual(["Verification does nothing until you turn something on."])
  })

  it("asks for a role when only a role is missing", () => {
    expect(verificationWarnings({ ...off, verifiedRoleId: null, verificationCaptcha: true })).toEqual([
      "Captcha or the Lodestone check is on, but no verified role is set, so nobody gets a role.",
    ])
    expect(verificationWarnings({ ...off, verificationLodestone: "code" })).toHaveLength(1)
  })

  it("warns about a role with nothing to earn it", () => {
    expect(verificationWarnings({ ...off, verifiedRoleId: "1" })).toEqual([
      "A verified role is set, but nothing is turned on to earn it.",
    ])
  })

  it("is quiet when a role and a check are set", () => {
    expect(verificationWarnings({ ...off, verifiedRoleId: "1", verificationCaptcha: true })).toEqual([])
    expect(verificationWarnings({ ...off, verifiedRoleId: "1", verificationLodestone: "exists" })).toEqual([])
  })

  it("flags a nickname request without the Lodestone check", () => {
    expect(
      verificationWarnings({ ...off, verifiedRoleId: "1", verificationCaptcha: true, verificationNickname: true })
    ).toEqual(["Change Nickname needs the Lodestone check, so it will not rename anyone."])
  })
})
