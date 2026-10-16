import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  personId: vi.fn(),
  requireVenue: vi.fn(),
  listMemberships: vi.fn(),
  terminate: vi.fn(),
  listTasks: vi.fn(),
  assignTask: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.requireVenue }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, getValidXvmApiPersonId: m.personId }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listMemberships: m.listMemberships,
  terminateMembership: m.terminate,
  listTasks: m.listTasks,
  assignTask: m.assignTask,
}))

import { NextResponse } from "next/server"
import { DELETE } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<{ venueId: string; membershipId: string }> }) => Promise<Response>
const remove = (membershipId = "2") =>
  (DELETE as unknown as Handler)(new Request("http://localhost/api", { method: "DELETE" }), {
    params: Promise.resolve({ venueId: "venue-1", membershipId }),
  })

const row = (id: number, personId: number, tier: string, discordId: string | null) => ({
  id,
  venue_id: "ven_1",
  person: { id: personId, display_name: `Person ${personId}`, discord_id: discordId },
  nickname: null,
  tier,
  effective_tier: tier,
  is_employed: true,
  position_ids: [],
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u-owner" } })
  m.token.mockResolvedValue("tok")
  m.personId.mockResolvedValue(10)
  m.requireVenue.mockResolvedValue({ ok: true, venue: { id: "ven_1" } })
  m.listMemberships.mockResolvedValue([row(1, 10, "owner", "d-owner"), row(2, 20, "staff", "d-staff")])
  m.terminate.mockResolvedValue({})
  m.listTasks.mockResolvedValue([])
  m.assignTask.mockResolvedValue({})
})

describe("DELETE a staff member", () => {
  it("terminates the member and succeeds", async () => {
    const res = await remove()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(m.terminate).toHaveBeenCalledWith("tok", "ven_1", 2)
  })

  it("unassigns the removed member's open tasks and leaves everyone else's alone", async () => {
    m.listTasks.mockResolvedValue([
      { id: 5, assigned_membership_id: 2, completed_at: null, cancelled_at: null },
      { id: 6, assigned_membership_id: 2, completed_at: "2026-10-01T00:00:00Z", cancelled_at: null },
      { id: 7, assigned_membership_id: 1, completed_at: null, cancelled_at: null },
    ])
    const res = await remove()
    expect(res.status).toBe(200)
    expect(m.assignTask).toHaveBeenCalledTimes(1)
    expect(m.assignTask).toHaveBeenCalledWith("tok", "ven_1", 5, { membership_id: null })
  })

  it("cleans nothing up when xvm-api refuses the termination", async () => {
    m.terminate.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "A venue must have at least one owner." })))
    const res = await remove()
    expect(res.status).toBe(409)
    expect(m.listTasks).not.toHaveBeenCalled()
  })

  it("refuses a caller who is not an owner or manager, before terminating anyone", async () => {
    m.personId.mockResolvedValue(20)
    const res = await remove()
    expect(res.status).toBe(403)
    expect(m.terminate).not.toHaveBeenCalled()
  })

  it("answers 404 for a venue the caller cannot see, before reading the roster", async () => {
    m.requireVenue.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Venue not found" }, { status: 404 }),
    })
    const res = await remove()
    expect(res.status).toBe(404)
    expect(m.listMemberships).not.toHaveBeenCalled()
  })

  it("reports partial success, with the member still terminated, when task cleanup fails", async () => {
    m.listTasks.mockRejectedValue(new XvmApiError(502, JSON.stringify({ detail: "tasks unavailable" })))
    const res = await remove()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, partial: true })
    expect(m.terminate).toHaveBeenCalledTimes(1)
  })
})
