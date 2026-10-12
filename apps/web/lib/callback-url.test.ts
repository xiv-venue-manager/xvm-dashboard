import { describe, it, expect } from "vitest"
import { signInCallbackUrl } from "./callback-url"

const origin = "http://localhost:3000"
const search = (callbackUrl: string) => `?${new URLSearchParams({ callbackUrl })}`
const returnTo = (callbackUrl: string) => signInCallbackUrl(search(callbackUrl), origin)

describe("signInCallbackUrl", () => {
  it("returns a same-origin path with its query", () => {
    expect(returnTo("/admin/feedback?report=7")).toBe("/admin/feedback?report=7")
  })

  it("returns the path of an absolute URL on our origin, as next-auth sends after a failed sign-in", () => {
    expect(returnTo("http://localhost:3000/admin/feedback?report=7")).toBe("/admin/feedback?report=7")
  })

  it("falls back to the dashboard when there is no callbackUrl", () => {
    expect(signInCallbackUrl("", origin)).toBe("/dashboard")
    expect(returnTo("")).toBe("/dashboard")
  })

  it.each([
    ["an absolute URL", "https://evil.example/admin/feedback"],
    ["a host that only starts with our host", "http://localhost:3000.evil.example/admin/feedback"],
    ["our host as the userinfo of another host", "http://localhost:3000@evil.example/"],
    ["our origin followed by a second slash", "http://localhost:3000//evil.example"],
    ["a protocol-relative URL", "//evil.example/admin/feedback"],
    ["a backslash, which browsers read as a second slash", "/\\evil.example"],
    ["a tab, which browsers strip to leave two slashes", "/\t/evil.example"],
    ["a javascript: URL", "javascript:alert(1)"],
  ])("refuses %s", (_, callbackUrl) => {
    expect(returnTo(callbackUrl)).toBe("/dashboard")
  })
})
