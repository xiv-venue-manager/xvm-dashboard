import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), errorResponse: vi.fn(), list: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyCredentials: m.list }))

import { GET } from "./route"

const credential = (over: Record<string, unknown>) => ({
  id: 1,
  kind: "api_key",
  client: "plugin",
  name: "plugin key",
  preview: "abc123",
  venue_id: null,
  issued_at: "2026-10-09T00:00:00Z",
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/plugin/credentials", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("lists only live plugin credentials", async () => {
    m.list.mockResolvedValue([
      credential({ id: 1 }),
      credential({ id: 2, client: "dashboard" }),
      credential({ id: 3, revoked_at: "2026-10-10T00:00:00Z" }),
    ])
    const body = await (await GET()).json()
    expect(body.credentials).toEqual([
      { id: 1, name: "plugin key", preview: "abc123", venueId: null, issuedAt: "2026-10-09T00:00:00Z", lastUsedAt: null },
    ])
  })
})
