import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn(), denied: false }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    m.denied ? new Response(null, { status: 401 }) : run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ addEventShift: m.act }))

import { POST } from "./route"

type Ctx = Parameters<typeof POST>[1]
const ctx = (eventId = "9", eventPositionId = "3"): Ctx => ({
  params: Promise.resolve({ venueId: "gilded-lily", eventId, eventPositionId }),
})
const call = (body: unknown = valid, eventId?: string, eventPositionId?: string) =>
  POST(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }),
    ctx(eventId, eventPositionId)
  )

const valid = { startsAt: "2026-10-11T19:00:00Z", endsAt: "2026-10-11T23:00:00Z", capacity: 2 }

beforeEach(() => {
  vi.resetAllMocks()
  m.denied = false
  m.act.mockResolvedValue(undefined)
})

describe("add a shift to an event position", () => {
  it("adds the shift with its times and seats", async () => {
    const res = await call()
    expect(res.status).toBe(201)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 9, 3, {
      starts_at: "2026-10-11T19:00:00Z",
      ends_at: "2026-10-11T23:00:00Z",
      capacity: 2,
    })
  })

  it("rejects a shift with no seats", async () => {
    expect((await call({ ...valid, capacity: 0 })).status).toBe(400)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric position id", async () => {
    expect((await call(valid, "9", "abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("answers 401 before it judges the body", async () => {
    m.denied = true
    expect((await call({})).status).toBe(401)
    expect(m.act).not.toHaveBeenCalled()
  })
})
