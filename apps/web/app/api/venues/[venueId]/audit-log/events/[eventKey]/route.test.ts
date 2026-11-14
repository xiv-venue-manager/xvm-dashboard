import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  configure: vi.fn(),
  stop: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  configureAuditLogEvent: m.configure,
  stopAuditLogEvent: m.stop,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
})

import { PUT, DELETE } from "./route"

const context = (eventKey: string) => ({ params: Promise.resolve({ venueId: "vn_1", eventKey }) })
const put = (body: unknown, eventKey = "message.deleted") =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }) as never, context(eventKey) as never)

describe("PUT /api/venues/[venueId]/audit-log/events/[eventKey]", () => {
  it("turns an event on with its colour", async () => {
    m.configure.mockResolvedValue({ event_key: "message.deleted", enabled: true, color: 0xff8800 })
    expect((await put({ color: 0xff8800 })).status).toBe(200)
    expect(m.configure).toHaveBeenCalledWith("tok", "xv-1", "message.deleted", 0xff8800)
  })

  it("turns an event on with no colour", async () => {
    m.configure.mockResolvedValue({ event_key: "voice.left", enabled: true, color: null })
    await put({ color: null }, "voice.left")
    expect(m.configure).toHaveBeenCalledWith("tok", "xv-1", "voice.left", null)
  })

  it("rejects an event key xvm-api does not have", async () => {
    expect((await put({ color: null }, "message.pinned")).status).toBe(400)
    expect(m.configure).not.toHaveBeenCalled()
  })

  it("rejects a colour outside 0 to 16777215", async () => {
    for (const color of [-1, 0x1000000, 1.5, "red"]) {
      expect((await put({ color })).status).toBe(400)
    }
    expect(m.configure).not.toHaveBeenCalled()
  })

  it("requires the color key", async () => {
    expect((await put({})).status).toBe(400)
  })
})

describe("DELETE /api/venues/[venueId]/audit-log/events/[eventKey]", () => {
  it("stops mirroring the event", async () => {
    m.stop.mockResolvedValue(undefined)
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context("member.joined") as never)
    expect(res.status).toBe(204)
    expect(m.stop).toHaveBeenCalledWith("tok", "xv-1", "member.joined")
  })

  it("rejects an event key xvm-api does not have", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context("nope") as never)
    expect(res.status).toBe(400)
    expect(m.stop).not.toHaveBeenCalled()
  })
})
