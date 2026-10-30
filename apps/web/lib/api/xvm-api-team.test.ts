import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  addTeamCatalogueItem,
  addTeamMember,
  getMyTeamProfile,
  getPublicTeam,
  listAdminTeam,
  listTeamCatalogue,
  removeTeamCatalogueItem,
  renameTeamCatalogueItem,
  reorderTeamCatalogue,
  removeTeamMember,
  searchTeamCandidates,
  setMyTeamPhoto,
  updateMyTeamProfile,
  updateTeamMember,
} from "./xvm-api"

function respond(body: unknown, status = 200) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status < 400,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  } as Response)
}

const lastCall = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit]
const headers = (init: RequestInit) => init.headers as Record<string, string>

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

describe("team client", () => {
  it("reads the public team with no credential", async () => {
    respond({ members: [] })
    await expect(getPublicTeam()).resolves.toEqual({ members: [] })
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/public/team")
    expect(headers(init).Authorization).toBeUndefined()
  })

  it("reads my card with my token", async () => {
    respond({ name: "N", listed: true })
    await getMyTeamProfile("tok")
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile")
    expect(headers(init).Authorization).toBe("Bearer tok")
  })

  it("patches only the fields it is given", async () => {
    respond({ name: "N" })
    await updateMyTeamProfile("tok", { bio: "Hello" })
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ bio: "Hello" })
  })

  it("sends photo position and zoom in the patch", async () => {
    respond({ name: "N" })
    await updateMyTeamProfile("tok", { photo_x: 0.2, photo_y: 0.8, photo_zoom: 1.5 })
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ photo_x: 0.2, photo_y: 0.8, photo_zoom: 1.5 })
  })

  it("uploads a photo as multipart without setting its own content type", async () => {
    respond({ name: "N" })
    await setMyTeamPhoto("tok", new Blob(["x"], { type: "image/png" }))
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile/photo")
    expect(init.method).toBe("PUT")
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob)
    expect(headers(init)["Content-Type"]).toBeUndefined()
  })

  it("lists, adds, edits and removes team members as an admin", async () => {
    respond([])
    await listAdminTeam("tok")
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team")

    respond({ person_id: 7 }, 201)
    await addTeamMember("tok", { person_id: 7, role_ids: [1, 2], group_id: 3 })
    expect(lastCall()[1].method).toBe("POST")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ person_id: 7, role_ids: [1, 2], group_id: 3 })

    respond({ person_id: 7 })
    await updateTeamMember("tok", 7, { sort_order: 2 })
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/7")
    expect(lastCall()[1].method).toBe("PATCH")

    respond({ person_id: 7 })
    await updateTeamMember("tok", 7, { role_ids: [2], group_id: 4 })
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ role_ids: [2], group_id: 4 })

    respond(null, 204)
    await removeTeamMember("tok", 7)
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/7")
    expect(lastCall()[1].method).toBe("DELETE")
  })

  it("encodes a candidate search", async () => {
    respond([])
    await searchTeamCandidates("tok", "a&b c")
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/candidates?q=a%26b%20c")
  })

  it.each(["roles", "groups"] as const)("manages the %s catalogue", async (kind) => {
    respond([])
    await listTeamCatalogue("tok", kind)
    expect(lastCall()[0]).toBe(`http://xvm-api.test/admin/team/${kind}`)
    expect(headers(lastCall()[1]).Authorization).toBe("Bearer tok")

    respond({ id: 1 }, 201)
    await addTeamCatalogueItem("tok", kind, "Lead")
    expect(lastCall()[0]).toBe(`http://xvm-api.test/admin/team/${kind}`)
    expect(lastCall()[1].method).toBe("POST")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ name: "Lead" })

    respond({ id: 1 })
    await renameTeamCatalogueItem("tok", kind, 5, "Chief")
    expect(lastCall()[0]).toBe(`http://xvm-api.test/admin/team/${kind}/5`)
    expect(lastCall()[1].method).toBe("PATCH")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ name: "Chief" })

    respond([])
    await reorderTeamCatalogue("tok", kind, [3, 1, 2])
    expect(lastCall()[0]).toBe(`http://xvm-api.test/admin/team/${kind}/order`)
    expect(lastCall()[1].method).toBe("PUT")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ ids: [3, 1, 2] })

    respond(null, 204)
    await removeTeamCatalogueItem("tok", kind, 5)
    expect(lastCall()[0]).toBe(`http://xvm-api.test/admin/team/${kind}/5`)
    expect(lastCall()[1].method).toBe("DELETE")
  })
})
