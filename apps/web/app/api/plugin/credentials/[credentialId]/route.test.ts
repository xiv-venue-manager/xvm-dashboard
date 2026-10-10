import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyCredentials: m.list, revokeCredential: m.revoke }))

import { DELETE } from "./route"

const call = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/plugin/credentials/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ credentialId: id }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.list.mockResolvedValue([
    { id: 1, client: "plugin" },
    { id: 2, client: "dashboard" },
  ])
  m.revoke.mockResolvedValue({})
})

describe("DELETE /api/plugin/credentials/[credentialId]", () => {
  it("revokes one of the person's plugin credentials", async () => {
    expect((await call("1")).status).toBe(200)
    expect(m.revoke).toHaveBeenCalledWith("tok", 1)
  })

  it("is 404 for a credential that is not a plugin credential of theirs", async () => {
    expect((await call("2")).status).toBe(404)
    expect((await call("99")).status).toBe(404)
    expect(m.revoke).not.toHaveBeenCalled()
  })

  it.each(["abc", "0", "-3", "1.5"])("is 400 for the id %s", async (id) => {
    expect((await call(id)).status).toBe(400)
    expect(m.revoke).not.toHaveBeenCalled()
  })
})
