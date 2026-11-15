import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  lookup: vi.fn(),
  channel: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  forms: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/venue-access", () => ({ requireMyVenue: m.lookup }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/venue-guild", () => ({ requireChannelInGuild: m.channel }))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  updateForm: m.update,
  deleteForm: m.remove,
  listForms: m.forms,
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.lookup.mockResolvedValue({ ok: true, venue: { id: "xv-1" } })
  m.channel.mockResolvedValue({ ok: true })
  m.update.mockResolvedValue({ id: 4 })
  m.remove.mockResolvedValue(undefined)
  m.forms.mockResolvedValue([{ id: 4, response_channel_id: "1509616350337962099" }])
})

import { PATCH, DELETE } from "./route"

const SAME = "1509616350337962099"
const NEW = "1509616350337962100"
const context = (formId = "4") => ({ params: Promise.resolve({ venueId: "vn_1", formId }) })
const patch = (body: unknown, formId?: string) =>
  PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }) as never, context(formId) as never)

describe("PATCH /api/venues/[venueId]/forms/[formId]", () => {
  it("maps every field to xvm-api's names", async () => {
    const res = await patch({
      name: "Staff application",
      description: "Apply here",
      prePrompt: "Before",
      postPrompt: "After",
      color: 0x00b4ff,
      buttonLabel: "Apply",
      buttonEmoji: "\u2705",
      allowMultipleResponses: true,
      responseChannelId: SAME,
    })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, {
      name: "Staff application",
      description: "Apply here",
      pre_prompt: "Before",
      post_prompt: "After",
      color: 0x00b4ff,
      button_label: "Apply",
      button_emoji: "\u2705",
      allow_multiple_responses: true,
      response_channel_id: SAME,
    })
  })

  it("clears a blank text field and the colour with null", async () => {
    await patch({ description: "  ", color: null, responseChannelId: null })
    expect(m.channel).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith("tok", "xv-1", 4, { description: null, color: null, response_channel_id: null })
  })

  it("does not re-check the stored response channel but checks a new one", async () => {
    await patch({ responseChannelId: SAME })
    expect(m.channel).not.toHaveBeenCalled()
    await patch({ responseChannelId: NEW })
    expect(m.channel).toHaveBeenCalledWith("user-1", "vn_1", NEW)
  })

  it("refuses a response channel outside the venue's server", async () => {
    m.channel.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "channel_not_in_guild" }, { status: 400 }) })
    expect((await patch({ responseChannelId: NEW })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("rejects an empty body, a blank button label and a bad form id", async () => {
    expect((await patch({})).status).toBe(400)
    expect((await patch({ buttonLabel: " " })).status).toBe(400)
    expect((await patch({ name: "x" }, "abc")).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/venues/[venueId]/forms/[formId]", () => {
  it("deletes the form and answers 204", async () => {
    const res = await DELETE(new Request("http://localhost/api", { method: "DELETE" }) as never, context() as never)
    expect(res.status).toBe(204)
    expect(m.remove).toHaveBeenCalledWith("tok", "xv-1", 4)
  })
})
