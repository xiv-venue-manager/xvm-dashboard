import { describe, it, expect, vi, afterEach } from "vitest"
import { apiRoute, routePath } from "./api-fetch"

afterEach(() => vi.unstubAllGlobals())

describe("routePath", () => {
  it("fills dynamic segments and encodes them", () => {
    expect(routePath("/api/venues/[venueId]/follow", { venueId: "a b/c" })).toBe("/api/venues/a%20b%2Fc/follow")
  })

  it("joins catch-all segments", () => {
    expect(routePath("/api/auth/[...nextauth]", { nextauth: ["callback", "discord"] })).toBe(
      "/api/auth/callback/discord"
    )
  })

  it("appends a query string and drops undefined values", () => {
    expect(
      routePath("/api/venues/[venueId]/timeline", { venueId: "v" }, { limit: 50, eventId: undefined, reroll: true })
    ).toBe("/api/venues/v/timeline?limit=50&reroll=true")
  })

  it("leaves a route with no segments alone", () => {
    expect(routePath("/api/feedback")).toBe("/api/feedback")
  })
})

describe("apiRoute", () => {
  it("fetches the built path and passes the rest of init through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiRoute<{ ok: boolean }>("/api/venues/[venueId]", {
      params: { venueId: "v1" },
      method: "POST",
    })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith("/api/venues/v1", { method: "POST" })
  })
})

// These never run. They fail `tsc` if the route type stops being checked: the day AppRouteHandlerRoutes
// widens to string, or a segment stops being required, one of the expect-error lines becomes unused.
// A route is deleted in the same way a missing one is written here.
export function typeChecks() {
  void apiRoute("/api/feedback")
  void apiRoute("/api/venues/[venueId]", { params: { venueId: "v" } })
  void apiRoute<string[]>("/api/venues/[venueId]", { params: { venueId: "v" }, query: { limit: 5 } })

  // @ts-expect-error not a route handler
  void apiRoute("/api/this/route/does-not-exist")
  // @ts-expect-error a dynamic segment needs its params
  void apiRoute("/api/venues/[venueId]")
  // @ts-expect-error wrong segment name
  void apiRoute("/api/venues/[venueId]", { params: { venueSlug: "v" } })
  // @ts-expect-error this route has no segments, so it takes no params
  void apiRoute("/api/feedback", { params: { venueId: "v" } })
  // @ts-expect-error a built string is not a route
  void apiRoute(`/api/venues/${"v"}`)
}
