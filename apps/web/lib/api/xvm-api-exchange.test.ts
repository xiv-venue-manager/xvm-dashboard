import { describe, it, expect, vi, beforeEach } from "vitest"

import { exchangeToken } from "./xvm-api"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubEnv("XVM_API_DASHBOARD_SERVICE_TOKEN", "service")
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ secret: "s" }), { status: 201 }))
})

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string)

describe("exchangeToken", () => {
  it("leaves fresh_sign_in off a re-mint, which an API without the field would reject", async () => {
    await exchangeToken("4242", "A")
    expect(sentBody()).toEqual({ provider: "discord", external_id: "4242", display_name: "A" })
  })

  it("sends fresh_sign_in on a sign-in the person just made", async () => {
    await exchangeToken("4242", "A", true)
    expect(sentBody()).toEqual({ provider: "discord", external_id: "4242", display_name: "A", fresh_sign_in: true })
  })
})
