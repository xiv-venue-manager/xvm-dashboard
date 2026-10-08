import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  personId: vi.fn(),
  venueFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  apiKeyUpdateMany: vi.fn(),
  listMemberships: vi.fn(),
  terminate: vi.fn(),
  listTasks: vi.fn(),
  assignTask: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    venue: { findFirst: m.venueFindFirst },
    account: { findFirst: m.accountFindFirst },
    apiKey: { updateMany: m.apiKeyUpdateMany },
  },
}))
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
  m.venueFindFirst.mockResolvedValue({ id: "p-venue", xvmApiVenueId: "ven_1" })
  m.listMemberships.mockResolvedValue([row(1, 10, "owner", "d-owner"), row(2, 20, "staff", "d-staff")])
  m.terminate.mockResolvedValue({})
  m.listTasks.mockResolvedValue([])
  m.assignTask.mockResolvedValue({})
  m.accountFindFirst.mockResolvedValue({ userId: "u-staff" })
  m.apiKeyUpdateMany.mockResolvedValue({ count: 1 })
})

describe("DELETE a staff member", () => {
  it("revokes the removed member's keys for this venue, finding them by Discord id and not through the credential table", async () => {
    const res = await remove()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(m.accountFindFirst).toHaveBeenCalledWith({
      where: { provider: "discord", providerAccountId: "d-staff" },
      select: { userId: true },
    })
    expect(m.apiKeyUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u-staff", venueId: "p-venue", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it("revokes nothing, and still succeeds, when the roster has no Discord id for the member", async () => {
    m.listMemberships.mockResolvedValue([row(1, 10, "owner", "d-owner"), row(2, 20, "staff", null)])
    const res = await remove()
    expect(await res.json()).toEqual({ success: true })
    expect(m.accountFindFirst).not.toHaveBeenCalled()
    expect(m.apiKeyUpdateMany).not.toHaveBeenCalled()
  })

  it("revokes nothing, and still succeeds, when that Discord id has no dashboard account", async () => {
    m.accountFindFirst.mockResolvedValue(null)
    const res = await remove()
    expect(await res.json()).toEqual({ success: true })
    expect(m.apiKeyUpdateMany).not.toHaveBeenCalled()
  })

  it("leaves keys alone when xvm-api refuses the termination", async () => {
    m.terminate.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "A venue must have at least one owner." })))
    const res = await remove()
    expect(res.status).toBe(409)
    expect(m.accountFindFirst).not.toHaveBeenCalled()
    expect(m.apiKeyUpdateMany).not.toHaveBeenCalled()
  })

  it("refuses a caller who is not an owner or manager, before terminating anyone", async () => {
    m.personId.mockResolvedValue(20)
    const res = await remove()
    expect(res.status).toBe(403)
    expect(m.terminate).not.toHaveBeenCalled()
  })

  it("reports partial success, with the member still terminated, when task cleanup fails", async () => {
    m.listTasks.mockRejectedValue(new XvmApiError(502, JSON.stringify({ detail: "tasks unavailable" })))
    const res = await remove()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, partial: true })
    expect(m.terminate).toHaveBeenCalledTimes(1)
  })
})
