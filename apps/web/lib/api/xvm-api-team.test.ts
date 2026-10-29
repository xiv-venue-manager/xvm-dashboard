import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.XVM_API_BASE_URL = "http://xvm-api.test"
})

import {
  addTeamMember,
  getMyTeamProfile,
  getPublicTeam,
  listAdminTeam,
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
    await addTeamMember("tok", { person_id: 7, role_title: "Tester", group_label: "Testers" })
    expect(lastCall()[1].method).toBe("POST")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ person_id: 7, role_title: "Tester", group_label: "Testers" })

    respond({ person_id: 7 })
    await updateTeamMember("tok", 7, { sort_order: 2 })
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/7")
    expect(lastCall()[1].method).toBe("PATCH")

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
})
