import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  gate: vi.fn(),
  context: vi.fn(),
  logVisit: vi.fn(),
  listLogs: vi.fn(),
  emit: vi.fn(),
  xp: vi.fn(),
}))

vi.mock("@/lib/api/plugin-auth", () => ({ pluginAuthGate: m.gate }))
vi.mock("@/lib/api/plugin-xvm", () => ({ pluginXvmContext: m.context }))
vi.mock("@/lib/sse/venue-events", () => ({ venueEventBus: { emit: m.emit } }))
vi.mock("@/lib/discord-feed", () => ({ postPatronVisitXp: m.xp }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  logPatronVisit: m.logVisit,
  listPatronLogs: m.listLogs,
}))

import { GET, POST } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

const visit = {
  venueId: "v1",
  characterName: "Test Char",
  world: "Cactuar",
  action: "enter",
  timestamp: "2026-10-03T19:05:00.000Z",
}

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/plugin/patron-visits", { method: "POST", body: JSON.stringify(body) }) as never)
const get = (query = "venueId=v1") =>
  GET(new Request(`http://localhost/api/plugin/patron-visits?${query}`) as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.gate.mockResolvedValue({ ok: true, auth: { userId: "u1", venues: ["v1"] } })
  m.context.mockResolvedValue({ token: "tok", xvmApiVenueId: "xv-1" })
  m.logVisit.mockResolvedValue({ id: 5, deduped: false, action: "enter", was_working: false, event_id: 12 })
})

describe("POST /api/plugin/patron-visits", () => {
  it("forwards the crossing to xvm-api as the key owner and returns the API's event tag", async () => {
    const res = await post(visit)
    expect(res.status).toBe(200)
    expect(m.logVisit).toHaveBeenCalledWith("tok", "xv-1", {
      character_name: "Test Char",
      world: "Cactuar",
      action: "enter",
      ts: "2026-10-03T19:05:00.000Z",
    })
    expect(await res.json()).toMatchObject({
      success: true,
      data: { id: "5", deduped: false, wasWorking: false, eventId: "12" },
    })
  })

  it("emits to the live page and posts XP for a new patron enter", async () => {
    await post(visit)
    expect(m.emit).toHaveBeenCalledWith("v1", expect.objectContaining({ id: "5", type: "patron_enter" }))
    expect(m.xp).toHaveBeenCalledWith("v1", "Test Char", "Cactuar")
  })

  it("stays quiet for a duplicate and for staff working the door", async () => {
    m.logVisit.mockResolvedValueOnce({ id: 5, deduped: true, action: "enter", was_working: false, event_id: null })
    await post(visit)
    m.logVisit.mockResolvedValueOnce({ id: 6, deduped: false, action: "enter", was_working: true, event_id: null })
    await post(visit)
    expect(m.emit).not.toHaveBeenCalled()
  })

  it("maps leave to patron_exit and skips XP", async () => {
    m.logVisit.mockResolvedValue({ id: 7, deduped: false, action: "leave", was_working: false, event_id: null })
    await post({ ...visit, action: "leave" })
    expect(m.emit).toHaveBeenCalledWith("v1", expect.objectContaining({ type: "patron_exit" }))
    expect(m.xp).not.toHaveBeenCalled()
  })

  it("returns the context error when the key owner's link is unusable", async () => {
    m.context.mockResolvedValue({ error: NextResponse.json({ error: "expired" }, { status: 503 }) })
    expect((await post(visit)).status).toBe(503)
    expect(m.logVisit).not.toHaveBeenCalled()
  })

  it("passes an xvm-api refusal through with its status", async () => {
    m.logVisit.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "This action requires a venue member." })))
    const res = await post(visit)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "This action requires a venue member." })
  })

  it("rejects a venue the key is not authorised for before calling xvm-api", async () => {
    expect((await post({ ...visit, venueId: "other" })).status).toBe(403)
    expect(m.context).not.toHaveBeenCalled()
  })

  it("rejects an invalid action", async () => {
    expect((await post({ ...visit, action: "dance" })).status).toBe(400)
  })
})

describe("GET /api/plugin/patron-visits", () => {
  it("reads a 59 day window and keeps the old response shape", async () => {
    m.listLogs.mockResolvedValue([
      {
        id: 9,
        character_name: "Test Char",
        world: "Cactuar",
        action: "enter",
        count_change: 1,
        ts: "2026-10-03T19:05:00Z",
        logged_at: "2026-10-03T19:05:01Z",
      },
    ])
    const res = await get("venueId=v1&limit=500")
    const [, , opts] = m.listLogs.mock.calls[0]
    expect(opts.limit).toBe(200)
    expect(new Date(opts.to).getTime() - new Date(opts.from).getTime()).toBe(59 * 86400000)
    expect(await res.json()).toEqual({
      visits: [
        {
          id: "9",
          characterName: "Test Char",
          world: "Cactuar",
          action: "ENTER",
          countChange: 1,
          timestamp: "2026-10-03T19:05:00Z",
          loggedAt: "2026-10-03T19:05:01Z",
        },
      ],
    })
  })

  it("requires venueId", async () => {
    expect((await get("")).status).toBe(400)
  })
})
