import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  requireVenue: vi.fn(),
  errorResponse: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: m.errorResponse,
}))

import { parseId, withVenueAction } from "./venue-action"

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
})

describe("parseId", () => {
  it("reads whole numbers and refuses anything else", () => {
    expect(parseId("12")).toBe(12)
    expect(parseId("abc")).toBeNull()
    expect(parseId("1.5")).toBeNull()
  })
})

describe("withVenueAction", () => {
  it("runs with the token and the venue resolved from the caller's xvm-api venues", async () => {
    const run = vi.fn().mockResolvedValue(NextResponse.json({ success: true }))
    const res = await withVenueAction("gilded-lily", "test", run)
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(run).toHaveBeenCalledWith("tok", "ven_1")
  })

  it("answers 401 without running when there is no session", async () => {
    m.session.mockResolvedValue(null)
    const run = vi.fn()
    expect((await withVenueAction("gilded-lily", "test", run)).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("answers 503 when the xvm-api link is not established", async () => {
    m.token.mockResolvedValue(null)
    const run = vi.fn()
    expect((await withVenueAction("gilded-lily", "test", run)).status).toBe(503)
    expect(run).not.toHaveBeenCalled()
  })

  it("passes a venue the caller cannot see back as its own response", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    const run = vi.fn()
    expect((await withVenueAction("gilded-lily", "test", run)).status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it("hands a thrown xvm-api error to the shared error response", async () => {
    m.errorResponse.mockReturnValue(new Response(null, { status: 409 }))
    const failure = new Error("People have held seats here")
    const res = await withVenueAction("gilded-lily", "test", async () => {
      throw failure
    })
    expect(res.status).toBe(409)
    expect(m.errorResponse).toHaveBeenCalledWith(failure, "u1", expect.any(String))
  })
})
