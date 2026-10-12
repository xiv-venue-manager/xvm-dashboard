import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ createPairingCode: m.create }))

import { POST } from "./route"

const call = () => POST(new NextRequest("http://localhost/api/plugin/pairing-codes", { method: "POST" }))

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
})

describe("POST /api/plugin/pairing-codes", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 503 when the person has no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
  })

  it("returns the code and when it expires", async () => {
    m.create.mockResolvedValue({ code: "ABCD1234", client: "plugin", venue_id: null, expires_at: "2026-10-10T00:00:00Z" })
    const res = await call()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ code: "ABCD1234", expiresAt: "2026-10-10T00:00:00Z" })
    expect(m.create).toHaveBeenCalledWith("tok")
  })

  it("hands an xvm-api failure to the shared error response", async () => {
    m.create.mockRejectedValue(new Error("down"))
    m.errorResponse.mockResolvedValue(NextResponse.json({ error: "xvm-api unavailable" }, { status: 502 }))
    expect((await call()).status).toBe(502)
    expect(m.errorResponse).toHaveBeenCalledWith(expect.any(Error), "u1", "[plugin pairing] create code error")
  })
})
