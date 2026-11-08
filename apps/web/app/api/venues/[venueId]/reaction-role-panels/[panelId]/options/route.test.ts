import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  add: vi.fn(),
  role: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  xvmApiErrorResponse: async () => NextResponse.json({ error: "upstream" }, { status: 502 }),
}))
vi.mock("@/lib/api/xvm-api", () => ({ addPanelOption: m.add }))
vi.mock("@/lib/api/venue-guild", () => ({ requireRoleInGuild: m.role }))

import { POST } from "./route"

const ROLE = "1509616350337962101"
const context = { params: Promise.resolve({ venueId: "my-venue", panelId: "7" }) }
const post = (body: unknown) =>
  POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }) as never, context as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.role.mockResolvedValue({ ok: true })
  m.add.mockResolvedValue({ id: 3, role_id: ROLE, label: "Bard", emoji: null })
})

describe("POST /api/venues/[venueId]/reaction-role-panels/[panelId]/options", () => {
  it("checks the role against the venue's server, then adds the option", async () => {
    const res = await post({ roleId: ROLE, label: "Bard" })
    expect(res.status).toBe(201)
    expect(m.role).toHaveBeenCalledWith("user-1", "my-venue", ROLE)
    expect(m.add).toHaveBeenCalledWith("tok", "xv-1", 7, { role_id: ROLE, label: "Bard", emoji: null })
  })

  it("adds nothing when the role is refused, and passes the refusal on", async () => {
    const refusal = { error: "role_unsafe", message: "That role can't be given out automatically: it has Administrator." }
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json(refusal, { status: 400 }) })
    const res = await post({ roleId: ROLE, label: "Bard" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(refusal)
    expect(m.add).not.toHaveBeenCalled()
  })

  it("adds nothing when the role can't be checked", async () => {
    m.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "bot_absent" }, { status: 409 }) })
    expect((await post({ roleId: ROLE, emoji: "🎭" })).status).toBe(409)
    expect(m.add).not.toHaveBeenCalled()
  })

  it("asks Discord nothing for a body it refuses anyway", async () => {
    expect((await post({ roleId: ROLE })).status).toBe(400)
    expect((await post({ roleId: "not-a-role", label: "Bard" })).status).toBe(400)
    expect(m.role).not.toHaveBeenCalled()
    expect(m.add).not.toHaveBeenCalled()
  })

  it("refuses without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post({ roleId: ROLE, label: "Bard" })).status).toBe(401)
    expect(m.role).not.toHaveBeenCalled()
  })
})
