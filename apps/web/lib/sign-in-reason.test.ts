import { describe, it, expect } from "vitest"
import { DELETION_SIGN_IN_URL, signInNotice } from "./sign-in-reason"

describe("signInNotice", () => {
  it("explains a session ended by a pending deletion", () => {
    expect(signInNotice("deletion")).toMatch(/scheduled for deletion or was deleted/)
    expect(signInNotice("deletion")).toMatch(/cancels a pending deletion/)
  })

  it("says nothing for an unknown reason, including names on Object.prototype", () => {
    expect(signInNotice("unknown")).toBeNull()
    expect(signInNotice("constructor")).toBeNull()
  })

  it("says nothing without a reason", () => {
    expect(signInNotice(null)).toBeNull()
    expect(signInNotice("")).toBeNull()
  })
})

describe("DELETION_SIGN_IN_URL", () => {
  it("is the sign-in page with the reason the notice understands", () => {
    const url = new URL(DELETION_SIGN_IN_URL, "http://localhost")
    expect(url.pathname).toBe("/auth/signin")
    expect(signInNotice(url.searchParams.get("reason"))).not.toBeNull()
  })
})
