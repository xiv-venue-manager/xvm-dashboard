import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("XIVAUTH_CLIENT_ID", "cid")
  vi.stubEnv("XIVAUTH_CLIENT_SECRET", "secret")
  vi.stubEnv("NEXTAUTH_URL", "https://site.test")
  m.session.mockResolvedValue({ user: { id: "user-1" } })
})

describe("GET /api/xivauth/start", () => {
  it("sends a signed-out visitor to sign in", async () => {
    m.session.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://site.test/auth/signin")
  })

  it("goes back to the characters page when verification is not set up", async () => {
    vi.stubEnv("XIVAUTH_CLIENT_ID", "")
    const res = await GET()
    expect(res.headers.get("location")).toBe("https://site.test/dashboard/account/characters?xivauth=unavailable")
  })

  it("redirects to XIV Auth with state and a challenge, keeping the verifier only in an httpOnly cookie", async () => {
    const res = await GET()
    const location = new URL(res.headers.get("location")!)
    expect(location.origin + location.pathname).toBe("https://xivauth.net/oauth/authorize")
    const state = location.searchParams.get("state")!
    expect(state.length).toBeGreaterThan(10)
    expect(location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(location.searchParams.get("scope")).toBe("character:all")

    const cookie = res.cookies.get("xivauth_flow")!
    const flow = JSON.parse(cookie.value) as { state: string; verifier: string }
    expect(flow.state).toBe(state)
    expect(location.search).not.toContain(flow.verifier)
    const header = res.headers.get("set-cookie")!
    expect(header).toContain("HttpOnly")
    expect(header).toContain("Max-Age=600")
    expect(header).toContain("Path=/api/xivauth")
  })
})
