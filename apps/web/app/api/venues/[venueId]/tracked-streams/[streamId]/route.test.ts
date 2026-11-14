import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  role: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel, requireRoleInGuild: m.role }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  updateTrackedStream: m.update,
  deleteTrackedStream: m.remove,
}))

const CHANNEL = "1509616350337962099"
const ROLE = "1509616350337962100"

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.role.mockResolvedValue({ ok: true })
})

import { PATCH, DELETE } from "./route"

const context = (streamId: string) => ({ params: Promise.resolve({ venueId: "vn_1", streamId }) })
const patch = (body: unknown, streamId = "5") =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(streamId) as never)

describe("PATCH /api/venues/[venueId]/tracked-streams/[streamId]", () => {
  it("moves the alert to another channel", async () => {
    m.update.mockResolvedValue({ id: 5 })
    expect((await patch({ channelId: CHANNEL })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, { channel_id: CHANNEL })
  })

  it("clears the role with null without checking it against the server", async () => {
    m.update.mockResolvedValue({ id: 5 })
    await patch({ roleId: null })
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 5, { role_id: null })
    expect(m.role).not.toHaveBeenCalled()
  })

  it("checks a new role against the server", async () => {
    m.update.mockResolvedValue({ id: 5 })
    await patch({ roleId: ROLE })
    expect(m.role).toHaveBeenCalledWith("user-1", "vn_1", ROLE)
  })

  it("rejects a null channel, since an alert needs somewhere to post", async () => {
    expect((await patch({ channelId: null })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses a channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await patch({ channelId: CHANNEL })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses a role outside the venue's server", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "role_not_in_guild" }, { status: 400 }) })
    expect((await patch({ roleId: ROLE })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("rejects an id that is not a number", async () => {
    expect((await patch({ channelId: CHANNEL }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/tracked-streams/[streamId]", () => {
  it("removes the stream", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context("5") as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 5)
  })

  it("rejects an id that is not a number", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context("abc") as never)
    expect(res.status).toBe(400)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
