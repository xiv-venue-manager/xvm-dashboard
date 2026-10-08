import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchShouts } from "./xivvm-shouts"

function respondWith(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const shout = {
  id: "1",
  label: "Friday Night",
  fields: {},
  templateId: "open",
  separatorId: "dot",
  decorId: "diamond",
  createdAt: "2026-01-01T00:00:00Z",
}

afterEach(() => vi.unstubAllGlobals())

describe("fetchShouts", () => {
  it("returns the saved shouts", async () => {
    respondWith(Response.json([shout]))
    expect(await fetchShouts()).toEqual({ ok: true, shouts: [shout] })
  })

  it("treats an empty list as a real empty list", async () => {
    respondWith(Response.json([]))
    expect(await fetchShouts()).toEqual({ ok: true, shouts: [] })
  })

  it("reports an expired session as signed out", async () => {
    respondWith(Response.json({ error: "Unauthorized" }, { status: 401 }))
    expect(await fetchShouts()).toEqual({ ok: false, reason: "signed_out" })
  })

  it.each([403, 500, 502, 503])("reports a %i as unavailable, not as no shouts", async (status) => {
    respondWith(Response.json({ error: "nope" }, { status }))
    expect(await fetchShouts()).toEqual({ ok: false, reason: "unavailable" })
  })

  it("reports a network failure as unavailable instead of rejecting", async () => {
    respondWith(new TypeError("Failed to fetch"))
    expect(await fetchShouts()).toEqual({ ok: false, reason: "unavailable" })
  })

  it("reports a 200 whose body is not a list as unavailable", async () => {
    respondWith(Response.json({ shouts: [shout] }))
    expect(await fetchShouts()).toEqual({ ok: false, reason: "unavailable" })
  })

  it("reports a 200 whose body is not JSON as unavailable", async () => {
    respondWith(new Response("<html>gateway</html>", { status: 200 }))
    expect(await fetchShouts()).toEqual({ ok: false, reason: "unavailable" })
  })
})
