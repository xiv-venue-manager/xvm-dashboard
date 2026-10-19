import { describe, it, expect } from "vitest"
import { adminLoadErrorMessage } from "./admin-load-error"

describe("adminLoadErrorMessage", () => {
  it("tells someone without the admin scope to sign in again if they were just given access", () => {
    expect(adminLoadErrorMessage(403)).toMatch(/platform admin access/)
    expect(adminLoadErrorMessage(403)).toMatch(/sign out and back in/)
  })

  it("tells someone with a lapsed xvm-api link to sign in again, without mentioning admin access", () => {
    expect(adminLoadErrorMessage(503)).toMatch(/sign out and back in/i)
    expect(adminLoadErrorMessage(503)).not.toMatch(/admin/)
  })

  it("does not blame access for any other failure", () => {
    const message = adminLoadErrorMessage(500)
    expect(message).toContain("500")
    expect(message).not.toMatch(/admin|sign out/i)
  })
})
