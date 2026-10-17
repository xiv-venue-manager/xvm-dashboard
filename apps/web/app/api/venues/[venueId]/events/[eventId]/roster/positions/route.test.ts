import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn() }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ addEventPosition: m.act }))

import { POST } from "./route"

type Ctx = Parameters<typeof POST>[1]
const ctx = (eventId = "9"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", eventId }) })
const call = (body: unknown = { positionId: 4 }, eventId?: string) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx(eventId))

beforeEach(() => {
  vi.resetAllMocks()
  m.act.mockResolvedValue(undefined)
})

describe("add a position to an event roster", () => {
  it("adds the position against the venue resolved from the caller's xvm-api venues", async () => {
    const res = await call()
    expect(res.status).toBe(201)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 9, 4)
  })

  it("rejects a missing position", async () => {
    expect((await call({})).status).toBe(400)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric event id", async () => {
    expect((await call({ positionId: 4 }, "abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })
})
