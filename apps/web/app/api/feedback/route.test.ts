import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  submit: vi.fn(),
  list: vi.fn(),
  webhook: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/discord-webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord-webhook")>()),
  sendDiscordWebhook: m.webhook,
}))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  submitFeedback: m.submit,
  listMyFeedback: m.list,
}))

import { GET, POST } from "./route"
import { XvmApiError, type FeedbackRow } from "@/lib/api/xvm-api"

type Handler = (req: Request) => Promise<Response>
const ORIGIN = "https://shout.xivvenuemanager.com"
const row = (over: Partial<FeedbackRow> = {}): FeedbackRow => ({
  id: 4,
  person_id: 3,
  category: "bug_report",
  status: "new",
  subject: "Broken button",
  description: "It does nothing when clicked.",
  url: "https://example.test/page",
  user_agent: "TestAgent/1.0",
  screenshot_url: null,
  admin_notes: null,
  reviewed_by_person_id: null,
  reviewed_at: null,
  created_at: "2026-10-07T09:00:00Z",
  updated_at: "2026-10-07T09:00:00Z",
  ...over,
})
const valid = {
  category: "BUG_REPORT",
  subject: "Broken button",
  description: "It does nothing when clicked.",
  url: "https://example.test/page",
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  (POST as unknown as Handler)(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers })
  )
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  delete process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  m.session.mockResolvedValue({ user: { id: "user-1", name: "Test Person", email: "test@example.test" } })
  m.token.mockResolvedValue("tok")
  m.webhook.mockResolvedValue(undefined)
})

describe("POST /api/feedback", () => {
  it("is 401 with CORS headers when signed out", async () => {
    m.session.mockResolvedValue(null)
    const res = await post(valid)
    expect(res.status).toBe(401)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect(m.submit).not.toHaveBeenCalled()
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(503)
  })

  it("rejects an invalid body with 400 and no API call", async () => {
    for (const body of [{ ...valid, category: "OTHER" }, { ...valid, subject: "" }, { ...valid, description: "short" }]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(m.submit).not.toHaveBeenCalled()
  })

  it("rejects a description over the 4000 characters xvm-api accepts", async () => {
    expect((await post({ ...valid, description: "x".repeat(4001) })).status).toBe(400)
    expect(m.submit).not.toHaveBeenCalled()
  })

  it("sends xvm-api lower-case enums and the user agent, and returns the dashboard's shape", async () => {
    m.submit.mockResolvedValue(row())
    const res = await post(valid, { "user-agent": "TestAgent/1.0" })
    expect(res.status).toBe(201)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
    expect(m.submit).toHaveBeenCalledWith("tok", {
      category: "bug_report",
      subject: "Broken button",
      description: "It does nothing when clicked.",
      url: "https://example.test/page",
      user_agent: "TestAgent/1.0",
    })
    const body = await res.json()
    expect(body).toMatchObject({ id: "4", category: "BUG_REPORT", status: "NEW" })
  })

  it("cuts a long user agent to the 300 characters xvm-api accepts", async () => {
    m.submit.mockResolvedValue(row())
    await post(valid, { "user-agent": "a".repeat(400) })
    expect(m.submit.mock.calls[0][1].user_agent).toHaveLength(300)
  })

  it("forwards xvm-api's rate limit with CORS headers", async () => {
    m.submit.mockRejectedValue(new XvmApiError(429, JSON.stringify({ detail: "Too many reports." })))
    const res = await post(valid)
    expect(res.status).toBe(429)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
  })

  it("notifies the admin webhook with the session user when one is configured", async () => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = "https://discord.test/webhook"
    m.submit.mockResolvedValue(row())
    await post(valid)
    expect(m.webhook).toHaveBeenCalledTimes(1)
    expect(m.webhook.mock.calls[0][0]).toBe("https://discord.test/webhook")
  })

  it("does not call the webhook when xvm-api rejects the report", async () => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = "https://discord.test/webhook"
    m.submit.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "Blocked." })))
    await post(valid)
    expect(m.webhook).not.toHaveBeenCalled()
  })

  it("still answers 201 when the webhook fails", async () => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = "https://discord.test/webhook"
    m.webhook.mockRejectedValue(new Error("discord down"))
    m.submit.mockResolvedValue(row())
    expect((await post(valid)).status).toBe(201)
  })
})

describe("GET /api/feedback", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })

  it("is 503 when there is no xvm-api link", async () => {
    m.token.mockResolvedValue(null)
    expect((await get()).status).toBe(503)
  })

  it("returns the caller's reports in the dashboard's shape", async () => {
    m.list.mockResolvedValue([row(), row({ id: 5, category: "feature_request", status: "planned" })])
    const res = await get()
    expect(res.status).toBe(200)
    expect(m.list).toHaveBeenCalledWith("tok")
    const body = await res.json()
    expect(body.map((f: { id: string; category: string }) => [f.id, f.category])).toEqual([
      ["4", "BUG_REPORT"],
      ["5", "FEATURE_REQUEST"],
    ])
  })
})
