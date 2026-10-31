import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { encode } from "next-auth/jwt"

const m = vi.hoisted(() => ({ cookies: vi.fn(), getMe: vi.fn() }))

vi.mock("next/headers", () => ({ cookies: m.cookies }))
vi.mock("@/lib/api/xvm-api", async (orig) => ({ ...(await orig<typeof import("@/lib/api/xvm-api")>()), getMe: m.getMe }))

import { getValidXvmApiToken, getValidXvmApiPersonId, isXvmCredentialFresh, xvmCredentialFrom } from "./xvm-api-store"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

const DAY = 24 * 60 * 60 * 1000
const secret = "test-secret"

async function signedIn(jwt: Record<string, unknown>) {
  const value = await encode({ token: jwt as never, secret })
  m.cookies.mockResolvedValue({ getAll: () => [{ name: SESSION_COOKIE_NAME, value }] })
}

beforeEach(() => {
  m.getMe.mockReset()
  vi.stubEnv("NEXTAUTH_SECRET", secret)
})
afterEach(() => vi.unstubAllEnvs())

describe("getValidXvmApiToken", () => {
  it("reads the token from the session cookie", async () => {
    await signedIn({ id: "u1", xvm: { token: "tok", expiresAt: Date.now() + 10 * DAY } })
    expect(await getValidXvmApiToken("u1")).toBe("tok")
  })

  it("is null when the cookie belongs to another user", async () => {
    await signedIn({ id: "u2", xvm: { token: "tok", expiresAt: Date.now() + 10 * DAY } })
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("is null inside the refresh margin", async () => {
    await signedIn({ id: "u1", xvm: { token: "tok", expiresAt: Date.now() + DAY / 2 } })
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("is null when the JWT carries no xvm-api token", async () => {
    await signedIn({ id: "u1" })
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })

  it("is null with no session cookie", async () => {
    m.cookies.mockResolvedValue({ getAll: () => [] })
    expect(await getValidXvmApiToken("u1")).toBeNull()
  })
})

describe("getValidXvmApiPersonId", () => {
  it("asks /me with the token", async () => {
    await signedIn({ id: "u1", xvm: { token: "tok", expiresAt: Date.now() + 10 * DAY } })
    m.getMe.mockResolvedValue({ person: { id: 7 } })
    expect(await getValidXvmApiPersonId("u1")).toBe(7)
    expect(m.getMe).toHaveBeenCalledWith("tok")
  })

  it("is null without a token, and does not call /me", async () => {
    await signedIn({ id: "u1" })
    expect(await getValidXvmApiPersonId("u1")).toBeNull()
    expect(m.getMe).not.toHaveBeenCalled()
  })
})

describe("xvmCredentialFrom", () => {
  it("keeps the secret and the expiry in milliseconds", () => {
    const issued = { secret: "s", credential: { expires_at: "2026-11-30T00:00:00Z" } } as never
    expect(xvmCredentialFrom(issued)).toEqual({ token: "s", expiresAt: Date.parse("2026-11-30T00:00:00Z") })
  })

  it("refuses a credential with no expiry", () => {
    expect(() => xvmCredentialFrom({ secret: "s", credential: {} } as never)).toThrow("expires_at")
  })
})

describe("isXvmCredentialFresh", () => {
  it("is false for nothing", () => {
    expect(isXvmCredentialFresh(undefined)).toBe(false)
  })
})
