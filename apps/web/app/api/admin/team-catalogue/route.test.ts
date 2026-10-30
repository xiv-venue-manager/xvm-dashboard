import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  list: vi.fn(),
  add: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
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
  listTeamCatalogue: m.list,
  addTeamCatalogueItem: m.add,
  renameTeamCatalogueItem: m.rename,
  removeTeamCatalogueItem: m.remove,
  reorderTeamCatalogue: m.reorder,
}))

import { GET, POST } from "./[kind]/route"
import { PATCH, DELETE } from "./[kind]/[id]/route"
import { PUT } from "./[kind]/order/route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const call = (handler: unknown, method: string, params: Record<string, string>, body?: unknown) =>
  (handler as Handler)(new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: Promise.resolve(params),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("/api/admin/team-catalogue/[kind]", () => {
  it("is 403 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call(GET, "GET", { kind: "roles" })).status).toBe(403)
    expect((await call(POST, "POST", { kind: "roles" }, { name: "X" })).status).toBe(403)
    expect(m.list).not.toHaveBeenCalled()
    expect(m.add).not.toHaveBeenCalled()
  })

  it("is 404 for a kind that is not roles or groups, with no API call", async () => {
    expect((await call(GET, "GET", { kind: "teams" })).status).toBe(404)
    expect((await call(POST, "POST", { kind: "teams" }, { name: "X" })).status).toBe(404)
    expect((await call(PATCH, "PATCH", { kind: "teams", id: "1" }, { name: "X" })).status).toBe(404)
    expect((await call(DELETE, "DELETE", { kind: "teams", id: "1" })).status).toBe(404)
    expect((await call(PUT, "PUT", { kind: "teams" }, { ids: [1] })).status).toBe(404)
    for (const fn of [m.list, m.add, m.rename, m.remove, m.reorder, m.refresh]) expect(fn).not.toHaveBeenCalled()
  })

  it("lists the items", async () => {
    m.list.mockResolvedValue([{ id: 1, name: "Developer" }])
    const res = await call(GET, "GET", { kind: "roles" })
    expect(await res.json()).toEqual([{ id: 1, name: "Developer" }])
    expect(m.list).toHaveBeenCalledWith("tok", "roles")
  })

  it("rejects a blank, over-long or unknown-field add with no API call", async () => {
    for (const body of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(81) }, { name: "ok", extra: 1 }]) {
      expect((await call(POST, "POST", { kind: "roles" }, body)).status).toBe(400)
    }
    expect((await call(POST, "POST", { kind: "groups" }, { name: "x".repeat(41) })).status).toBe(400)
    expect(m.add).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("allows 80 characters for a role and 40 for a group, trimmed", async () => {
    m.add.mockResolvedValue({ id: 1 })
    expect((await call(POST, "POST", { kind: "roles" }, { name: ` ${"x".repeat(80)} ` })).status).toBe(201)
    expect(m.add).toHaveBeenLastCalledWith("tok", "roles", "x".repeat(80))
    expect((await call(POST, "POST", { kind: "groups" }, { name: "x".repeat(40) })).status).toBe(201)
    expect(m.refresh).toHaveBeenCalledTimes(2)
  })

  it("passes a duplicate-name 409 through and does not refresh", async () => {
    m.add.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "That name is already in the list." })))
    const res = await call(POST, "POST", { kind: "roles" }, { name: "Tester" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("already in the list")
    expect(m.refresh).not.toHaveBeenCalled()
  })
})

describe("/api/admin/team-catalogue/[kind]/[id]", () => {
  it("is 404 for an id that is not a number, with no API call", async () => {
    expect((await call(PATCH, "PATCH", { kind: "roles", id: "abc" }, { name: "X" })).status).toBe(404)
    expect((await call(DELETE, "DELETE", { kind: "roles", id: "1e3" })).status).toBe(404)
    expect(m.rename).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects an invalid rename with no API call", async () => {
    expect((await call(PATCH, "PATCH", { kind: "groups", id: "2" }, { name: "x".repeat(41) })).status).toBe(400)
    expect((await call(PATCH, "PATCH", { kind: "roles", id: "2" }, { name: " " })).status).toBe(400)
    expect(m.rename).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("renames and refreshes the public page", async () => {
    m.rename.mockResolvedValue({ id: 2, name: "Chief" })
    const res = await call(PATCH, "PATCH", { kind: "roles", id: "2" }, { name: " Chief " })
    expect(res.status).toBe(200)
    expect(m.rename).toHaveBeenCalledWith("tok", "roles", 2, "Chief")
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })

  it("removes and refreshes", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await call(DELETE, "DELETE", { kind: "groups", id: "2" })
    expect(res.status).toBe(200)
    expect(m.remove).toHaveBeenCalledWith("tok", "groups", 2)
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })

  it("passes the used-by 409 through and does not refresh", async () => {
    m.remove.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "Used by 3 people." })))
    const res = await call(DELETE, "DELETE", { kind: "roles", id: "2" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Used by 3 people.")
    expect(m.refresh).not.toHaveBeenCalled()
  })
})

describe("/api/admin/team-catalogue/[kind]/order", () => {
  it("rejects bad id lists with no API call", async () => {
    for (const body of [{}, { ids: [1, 1] }, { ids: [0] }, { ids: [1.5] }, { ids: ["1"] }, { ids: [1], extra: 1 }]) {
      expect((await call(PUT, "PUT", { kind: "roles" }, body)).status).toBe(400)
    }
    expect(m.reorder).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it("reorders and refreshes", async () => {
    m.reorder.mockResolvedValue([{ id: 2 }, { id: 1 }])
    const res = await call(PUT, "PUT", { kind: "groups" }, { ids: [2, 1] })
    expect(await res.json()).toEqual([{ id: 2 }, { id: 1 }])
    expect(m.reorder).toHaveBeenCalledWith("tok", "groups", [2, 1])
    expect(m.refresh).toHaveBeenCalledTimes(1)
  })

  it("does not refresh when xvm-api rejects the order", async () => {
    m.reorder.mockRejectedValue(new XvmApiError(422, JSON.stringify({ detail: "Not the current set." })))
    expect((await call(PUT, "PUT", { kind: "groups" }, { ids: [2, 1] })).status).toBe(422)
    expect(m.refresh).not.toHaveBeenCalled()
  })
})
