export type LodestoneCheck = "off" | "exists" | "code"

export interface VerificationSettings {
  verifiedRoleId: string | null
  verificationCaptcha: boolean
  verificationLodestone: LodestoneCheck
  verificationNickname: boolean
}

export function verificationWarnings(s: VerificationSettings): string[] {
  const check = s.verificationCaptcha || s.verificationLodestone !== "off"
  const warnings: string[] = []
  if (!check && !s.verifiedRoleId && !s.verificationNickname) {
    return ["Verification does nothing until you turn something on."]
  }
  if (check && !s.verifiedRoleId) {
    warnings.push("Captcha or the Lodestone check is on, but no verified role is set, so nobody gets a role.")
  }
  if (!check && s.verifiedRoleId) {
    warnings.push("A verified role is set, but nothing is turned on to earn it.")
  }
  if (s.verificationNickname && s.verificationLodestone === "off") {
    warnings.push("Change Nickname needs the Lodestone check, so it will not rename anyone.")
  }
  return warnings
}
