import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn(), denied: false }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    m.denied ? new Response(null, { status: 401 }) : run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ assignEventShift: m.act }))

import { POST } from "./route"

type Ctx = Parameters<typeof POST>[1]
const ctx = (eventShiftId = "20"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", eventShiftId }) })
const call = (body: unknown = { membershipId: 3 }, eventShiftId?: string) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }), ctx(eventShiftId))

beforeEach(() => {
  vi.resetAllMocks()
  m.denied = false
  m.act.mockResolvedValue(undefined)
})

describe("assign someone to an event shift", () => {
  it("assigns the member to the event shift", async () => {
    const res = await call()
    expect(res.status).toBe(201)
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 20, 3)
  })

  it("rejects a missing member", async () => {
    expect((await call({})).status).toBe(400)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric id", async () => {
    expect((await call({ membershipId: 3 }, "abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("answers 401 before it judges the body", async () => {
    m.denied = true
    expect((await call({})).status).toBe(401)
    expect(m.act).not.toHaveBeenCalled()
  })
})
