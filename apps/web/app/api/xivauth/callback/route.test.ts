import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  personId: vi.fn(),
  record: vi.fn(),
  exchange: vi.fn(),
  characters: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api-store")>()),
  getValidXvmApiPersonId: m.personId,
}))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  recordVerifiedCharacters: m.record,
}))
vi.mock("@/lib/api/xivauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xivauth")>()),
  exchangeCode: m.exchange,
  fetchSharedCharacters: m.characters,
}))

import { GET } from "./route"
import { XivAuthError } from "@/lib/api/xivauth"
import { XvmApiError } from "@/lib/api/xvm-api"

const shared = { persistent_key: "k", lodestone_id: "11865953", name: "Aa Bb", home_world: "Lich", data_center: "Light", verified_at: "x" }
const flow = encodeURIComponent(JSON.stringify({ state: "st", verifier: "ver" }))

const call = (query: string, cookie: string | null = `xivauth_flow=${flow}`) =>
  GET(new NextRequest(`https://site.test/api/xivauth/callback${query}`, { headers: cookie ? { cookie } : {} }))
const back = (res: Response) => new URL(res.headers.get("location")!)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubEnv("XIVAUTH_CLIENT_ID", "cid")
  vi.stubEnv("XIVAUTH_CLIENT_SECRET", "secret")
  vi.stubEnv("NEXTAUTH_URL", "https://site.test")
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.personId.mockResolvedValue(42)
  m.exchange.mockResolvedValue("access")
  m.characters.mockResolvedValue([shared])
  m.record.mockResolvedValue([{ outcome: "created" }])
})

describe("GET /api/xivauth/callback", () => {
  it("sends a signed-out visitor to sign in", async () => {
    m.session.mockResolvedValue(null)
    const res = await call("?code=c&state=st")
    expect(back(res).pathname).toBe("/auth/signin")
    expect(res.headers.get("set-cookie")).toMatch(/xivauth_flow=;.*Max-Age=0/)
    expect(m.exchange).not.toHaveBeenCalled()
  })

  it("records the characters and reports the counts, clearing the flow cookie", async () => {
    m.record.mockResolvedValue([{ outcome: "created" }, { outcome: "verified" }, { outcome: "transferred" }, { outcome: "conflict" }])
    const res = await call("?code=c&state=st")
    expect(m.exchange).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid" }), "c", "ver")
    expect(m.characters).toHaveBeenCalledWith("access")
    expect(m.record).toHaveBeenCalledWith(42, [
      { lodestone_id: 11865953, xivauth_key: "k", character_name: "Aa Bb", world: "Lich" },
    ])
    const to = back(res)
    expect(to.pathname).toBe("/dashboard/account/characters")
    expect(Object.fromEntries(to.searchParams)).toEqual({ xivauth: "done", verified: "2", transferred: "1", conflicts: "1" })
    expect(res.headers.get("set-cookie")).toMatch(/xivauth_flow=;.*Max-Age=0/)
  })

  it("reports a denial without calling XIV Auth", async () => {
    const res = await call("?error=access_denied&state=st")
    expect(back(res).searchParams.get("xivauth")).toBe("denied")
    expect(m.exchange).not.toHaveBeenCalled()
  })

  it.each([
    ["no flow cookie", "?code=c&state=st", null],
    ["a different state", "?code=c&state=other", `xivauth_flow=${flow}`],
    ["no code", "?state=st", `xivauth_flow=${flow}`],
    ["an unreadable cookie", "?code=c&state=st", "xivauth_flow=not-json"],
  ])("refuses %s", async (_label, query, cookie) => {
    const res = await call(query, cookie)
    expect(back(res).searchParams.get("xivauth")).toBe("state")
    expect(m.exchange).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
  })

  it("says so when XIV Auth shared nothing usable", async () => {
    m.characters.mockResolvedValue([])
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("none")
    expect(m.record).not.toHaveBeenCalled()
  })

  it("reports an error when XIV Auth or xvm-api fails, or there is no xvm-api link", async () => {
    m.exchange.mockRejectedValueOnce(new XivAuthError("token exchange failed: 400"))
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
    m.record.mockRejectedValueOnce(new XvmApiError(503, "down"))
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
    m.personId.mockResolvedValueOnce(null)
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
  })
})
