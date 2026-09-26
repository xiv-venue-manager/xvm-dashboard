import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ gate: vi.fn(), context: vi.fn(), listEvents: vi.fn() }))

vi.mock("@/lib/api/plugin-auth", () => ({ pluginAuthGate: m.gate }))
vi.mock("@/lib/api/plugin-xvm", () => ({ pluginXvmContext: m.context }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listEvents: m.listEvents,
}))

import { GET } from "./route"
import type { EventItem } from "@/lib/api/xvm-api"

const hours = (h: number) => new Date(Date.now() + h * 3600000).toISOString()
const item = (over: Partial<EventItem>): EventItem => ({
  materialized: true,
  id: 1,
  recurrence_rule_id: null,
  scheduled_at: null,
  title: "Karaoke",
  description: null,
  event_type: "SOCIAL",
  location: null,
  image_url: null,
  starts_at: hours(-1),
  ends_at: hours(2),
  published_at: hours(-24),
  cancelled_at: null,
  cancel_reason: null,
  ...over,
})

const get = (query = "venueId=v1") =>
  GET(new Request(`http://localhost/api/plugin/events/active?${query}`) as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.gate.mockResolvedValue({ ok: true, auth: { userId: "u1", venues: ["v1"] } })
  m.context.mockResolvedValue({ token: "tok", xvmApiVenueId: "xv-1" })
  m.listEvents.mockResolvedValue([])
})

describe("GET /api/plugin/events/active", () => {
  it("reports the running event with the old response shape", async () => {
    m.listEvents.mockResolvedValue([item({ id: 12, title: "Live Night" })])
    const body = await (await get()).json()
    expect(body).toMatchObject({ active: true, eventId: "12", title: "Live Night", status: "ACTIVE" })
    expect(typeof body.scheduledStart).toBe("string")
    expect(typeof body.scheduledEnd).toBe("string")
  })

  it("reports inactive when nothing is running, ignoring drafts, cancelled and upcoming events", async () => {
    m.listEvents.mockResolvedValue([
      item({ id: 1, published_at: null }),
      item({ id: 2, cancelled_at: hours(-1) }),
      item({ id: 3, starts_at: hours(1), ends_at: hours(3) }),
      item({ id: 4, starts_at: hours(-5), ends_at: hours(-2) }),
    ])
    expect(await (await get()).json()).toEqual({ active: false })
  })

  it("picks the latest start when two events overlap", async () => {
    m.listEvents.mockResolvedValue([
      item({ id: 1, title: "Earlier", starts_at: hours(-3), ends_at: hours(2) }),
      item({ id: 2, title: "Later", starts_at: hours(-1), ends_at: hours(2) }),
    ])
    expect((await (await get()).json()).title).toBe("Later")
  })

  it("returns a null event id for a running occurrence that has no row yet", async () => {
    m.listEvents.mockResolvedValue([item({ id: null, materialized: false, recurrence_rule_id: 3 })])
    expect(await (await get()).json()).toMatchObject({ active: true, eventId: null })
  })

  it("rejects a venue the key is not authorised for", async () => {
    expect((await get("venueId=other")).status).toBe(403)
    expect(m.listEvents).not.toHaveBeenCalled()
  })
})
