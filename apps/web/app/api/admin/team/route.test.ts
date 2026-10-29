import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/refresh-team", () => ({ refreshTeamPage: m.refresh }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listAdminTeam: m.list,
  addTeamMember: m.add,
  updateTeamMember: m.update,
  removeTeamMember: m.remove,
  searchTeamCandidates: m.search,
}))

import { GET, POST } from "./route"
import { PATCH, DELETE } from "./[personId]/route"
import { GET as CANDIDATES } from "./candidates/route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx?: { params: Promise<{ personId: string }> }) => Promise<Response>
const call = (handler: unknown, method: string, body?: unknown, url = "http://localhost/api") =>
  (handler as Handler)(new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }))
const withId = (handler: unknown, method: string, id: string, body?: unknown) =>
  (handler as Handler)(new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: Promise.resolve({ personId: id }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("/api/admin/team", () => {
  it("is 403 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call(GET, "GET")).status).toBe(403)
  })

  it("forwards xvm-api's 403 for someone without the platform_admin scope", async () => {
    m.list.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "This action requires the platform_admin scope." })))
    const res = await call(GET, "GET")
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("platform_admin")
  })

  it("lists the team", async () => {
    m.list.mockResolvedValue([{ person_id: 1 }])
    const res = await call(GET, "GET")
    expect(await res.json()).toEqual([{ person_id: 1 }])
  })

  it("rejects an invalid add with no API call", async () => {
    const ok = { person_id: 1, role_ids: [1], group_id: 1 }
    for (const body of [
      {},
      { ...ok, person_id: 0 },
      { ...ok, role_ids: [] },
      { ...ok, role_ids: [1, 1] },
      { ...ok, role_ids: [0] },
      { person_id: 1, role_ids: [1] },
      { ...ok, group_id: 0 },
      { ...ok, role_title: "X" },
    ]) {
      expect((await call(POST, "POST", body)).status).toBe(400)
    }
    expect(m.add).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("adds a member", async () => {
    m.add.mockResolvedValue({ person_id: 7 })
    const res = await call(POST, "POST", { person_id: 7, role_ids: [1, 2], group_id: 3 })
    expect(res.status).toBe(201)
    expect(m.add).toHaveBeenCalledWith("tok", { person_id: 7, role_ids: [1, 2], group_id: 3 })
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })

  it("passes xvm-api's 409 for a double add through", async () => {
    m.add.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "That person is already on the team." })))
    expect((await call(POST, "POST", { person_id: 7, role_ids: [1], group_id: 1 })).status).toBe(409)
    expect(m.refresh).not.toHaveBeenCalled()
  })
})

describe("/api/admin/team/[personId]", () => {
  it("is 404 for an id that is not a number, with no API call", async () => {
    expect((await withId(PATCH, "PATCH", "abc", { group_id: 1 })).status).toBe(404)
    expect((await withId(DELETE, "DELETE", "1e3")).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("rejects empty or repeated roles, a bad group or a negative order", async () => {
    for (const body of [{ role_ids: [] }, { role_ids: [2, 2] }, { group_id: 0 }, { group_id: null }, { sort_order: -1 }, { role_title: "X" }]) {
      expect((await withId(PATCH, "PATCH", "7", body)).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("updates the roles, group and order", async () => {
    m.update.mockResolvedValue({ person_id: 7 })
    const res = await withId(PATCH, "PATCH", "7", { role_ids: [2, 1], group_id: 4, sort_order: 2 })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", 7, { role_ids: [2, 1], group_id: 4, sort_order: 2 })
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })

  it("does not refresh when xvm-api rejects an update or a removal", async () => {
    m.update.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "Not on the team." })))
    m.remove.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "Not on the team." })))
    expect((await withId(PATCH, "PATCH", "7", { group_id: 2 })).status).toBe(404)
    expect((await withId(DELETE, "DELETE", "7")).status).toBe(404)
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("removes a member", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await withId(DELETE, "DELETE", "7")
    expect(res.status).toBe(200)
    expect(m.remove).toHaveBeenCalledWith("tok", 7)
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })
})

describe("/api/admin/team/candidates", () => {
  it("needs at least two characters", async () => {
    expect((await call(CANDIDATES, "GET", undefined, "http://localhost/api?q=a")).status).toBe(400)
    expect((await call(CANDIDATES, "GET", undefined, "http://localhost/api")).status).toBe(400)
    expect(m.search).not.toHaveBeenCalled()
  })

  it("searches by name", async () => {
    m.search.mockResolvedValue([{ person_id: 3, name: "Outsider" }])
    const res = await call(CANDIDATES, "GET", undefined, "http://localhost/api?q=out")
    expect(await res.json()).toEqual([{ person_id: 3, name: "Outsider" }])
    expect(m.search).toHaveBeenCalledWith("tok", "out")
  })
})
