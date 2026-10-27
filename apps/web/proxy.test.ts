import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  getToken: vi.fn(),
}))

vi.mock("next-auth/jwt", () => ({ getToken: m.getToken }))

import { proxy } from "./proxy"
import { signInCallbackUrl } from "@/lib/callback-url"

const deepLink = "http://localhost:3000/admin/feedback?report=7"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("proxy", () => {
  it("sends a signed-out request to sign-in with its path and query as the callbackUrl", async () => {
    m.getToken.mockResolvedValue(null)

    const res = await proxy(new NextRequest(deepLink))

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/auth/signin")
    expect(location.searchParams.get("callbackUrl")).toBe("/admin/feedback?report=7")
    expect(signInCallbackUrl(location.search, location.origin)).toBe("/admin/feedback?report=7")
  })

  it("lets a signed-in request through", async () => {
    m.getToken.mockResolvedValue({ id: "user-1" })

    const res = await proxy(new NextRequest(deepLink))

    expect(res.headers.get("location")).toBeNull()
  })

  it("sends a request whose token is marked as pending deletion to sign-in, saying why", async () => {
    m.getToken.mockResolvedValue({ id: "user-1", deletionPending: true })

    const res = await proxy(new NextRequest(deepLink))

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/auth/signin")
    expect(location.searchParams.get("reason")).toBe("deletion")
    expect(location.searchParams.get("callbackUrl")).toBe("/admin/feedback?report=7")
  })

  it("gives a signed-out request no reason", async () => {
    m.getToken.mockResolvedValue(null)

    const res = await proxy(new NextRequest(deepLink))

    expect(new URL(res.headers.get("location")!).searchParams.has("reason")).toBe(false)
  })
})
