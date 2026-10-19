import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  requireVenue: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/venue-access")>()),
  requireMyVenue: m.requireVenue,
}))
vi.mock("@/lib/api/xvm-page-read", () => ({ xvmPageReader: vi.fn(async () => vi.fn()) }))

import { GET } from "./route"
import { venueEventBus } from "@/lib/sse/venue-events"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string }> }) => Promise<Response>
const open = (signal?: AbortSignal) =>
  (GET as unknown as Handler)(new Request("http://localhost/api/stream/gilded-lily", { signal }), {
    params: Promise.resolve({ venueId: "gilded-lily" }),
  })

const roomEvent = (venueId: string) => ({
  id: "room-1-t",
  type: "room_status" as const,
  venueId,
  timestamp: "2026-10-16T18:00:00Z",
  data: { roomId: 1, name: "Suite", isOccupied: true, status: "reserved" },
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1", role: "OWNER" } })
})

describe("venue event stream", () => {
  it("answers 404 for a venue the caller cannot see, and subscribes to nothing", async () => {
    m.requireVenue.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    const res = await open()
    expect(res.status).toBe(404)
    expect(venueEventBus.listenerCount("gilded-lily")).toBe(0)
  })

  it("rejects an unauthenticated request before resolving the venue", async () => {
    m.session.mockResolvedValue(null)
    expect((await open()).status).toBe(401)
    expect(m.requireVenue).not.toHaveBeenCalled()
  })

  it("subscribes under the xvm-api venue id, not the id in the URL, and delivers events published under it", async () => {
    const abort = new AbortController()
    const res = await open(abort.signal)
    expect(res.status).toBe(200)
    expect(m.requireVenue).toHaveBeenCalledWith("u1", "gilded-lily", expect.any(String))
    expect(venueEventBus.listenerCount("ven_1")).toBe(1)
    expect(venueEventBus.listenerCount("gilded-lily")).toBe(0)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toContain("connected")

    venueEventBus.emit("ven_1", roomEvent("ven_1"))
    expect(decoder.decode((await reader.read()).value)).toContain("room-1-t")

    abort.abort()
    expect(venueEventBus.listenerCount("ven_1")).toBe(0)
  })
})
