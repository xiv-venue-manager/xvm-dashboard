import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ act: vi.fn(), denied: false }))

vi.mock("@/lib/api/venue-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-action")>()),
  withVenueAction: async (_venue: string, _label: string, run: (t: string, v: string) => Promise<Response>) =>
    m.denied ? new Response(null, { status: 401 }) : run("tok", "ven_1"),
}))
vi.mock("@/lib/api/xvm-api", () => ({ applyEventRosterToFuture: m.act }))

import { POST } from "./route"

type Ctx = Parameters<typeof POST>[1]
const ctx = (eventId = "9"): Ctx => ({ params: Promise.resolve({ venueId: "gilded-lily", eventId }) })
const call = (eventId?: string) => POST(new Request("http://localhost/api", { method: "POST" }), ctx(eventId))

beforeEach(() => {
  vi.resetAllMocks()
  m.denied = false
  m.act.mockResolvedValue({ copied: 2, skipped: 1 })
})

describe("apply an event roster to future occurrences", () => {
  it("returns the copied and skipped counts from xvm-api", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ copied: 2, skipped: 1 })
    expect(m.act).toHaveBeenCalledWith("tok", "ven_1", 9)
  })

  it("rejects a non-numeric event id", async () => {
    expect((await call("abc")).status).toBe(404)
    expect(m.act).not.toHaveBeenCalled()
  })

  it("answers 401 before it acts", async () => {
    m.denied = true
    expect((await call()).status).toBe(401)
    expect(m.act).not.toHaveBeenCalled()
  })
})
