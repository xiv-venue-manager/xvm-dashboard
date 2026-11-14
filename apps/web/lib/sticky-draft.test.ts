import { describe, it, expect } from "vitest"
import {
  STICKY_LIMITS,
  emptyStickyDraft,
  stickyBodySchema,
  stickyDraftToBody,
  stickyProblems,
  stickyRowToDraft,
  stickyToEmbedDraft,
  stickyTotalLength,
} from "@/lib/sticky-draft"
import type { StickyRow } from "@/lib/api/xvm-api"

const row: StickyRow = {
  id: 3,
  channel_id: "1234567890123456789",
  enabled: true,
  title: "Rules",
  description: "Be kind",
  color: 0xff8800,
  url: "https://example.com",
  timestamp_at: "2026-11-14T10:00:00.000Z",
  header_text: "Staff",
  header_url: "https://example.com/staff",
  footer_text: "Thanks",
  header_icon_url: "https://cdn.example.com/h.png",
  footer_icon_url: "https://cdn.example.com/f.png",
  thumbnail_url: "https://cdn.example.com/t.png",
  image_url: "https://cdn.example.com/i.png",
  created_at: "2026-11-14T09:00:00Z",
  updated_at: "2026-11-14T09:00:00Z",
}

const valid = { ...emptyStickyDraft, channelId: "1234567890123456789" }

describe("sticky draft", () => {
  it("turns a row into a draft and back", () => {
    const draft = stickyRowToDraft(row)
    expect(draft).toMatchObject({ channelId: row.channel_id, color: "#ff8800", headerText: "Staff", enabled: true })
    expect(stickyDraftToBody(draft)).toEqual({
      channel_id: row.channel_id,
      enabled: true,
      title: "Rules",
      description: "Be kind",
      color: 0xff8800,
      url: "https://example.com",
      timestamp_at: "2026-11-14T10:00:00.000Z",
      header_text: "Staff",
      header_url: "https://example.com/staff",
      footer_text: "Thanks",
    })
  })

  it("sends null for blank fields so a save clears them", () => {
    const body = stickyDraftToBody({ ...stickyRowToDraft(row), title: "  ", description: "", color: "", timestamp: "" })
    expect(body).toMatchObject({ title: null, description: null, color: null, timestamp_at: null })
  })

  it("keeps the channel id a string", () => {
    expect(stickyDraftToBody(valid).channel_id).toBe("1234567890123456789")
  })

  it("accepts a clean draft", () => {
    expect(stickyProblems(valid)).toEqual([])
    expect(stickyBodySchema.safeParse(stickyDraftToBody(valid)).success).toBe(true)
  })

  it("needs a channel that is a snowflake", () => {
    expect(stickyProblems({ ...valid, channelId: "" })).toEqual(["Pick the channel."])
    expect(stickyProblems({ ...valid, channelId: "general" })).toEqual(["The channel needs a numeric Discord ID."])
    expect(stickyBodySchema.safeParse({ ...stickyDraftToBody(valid), channel_id: "general" }).success).toBe(false)
  })

  it("needs a title for a title link and header text for a header link", () => {
    expect(stickyProblems({ ...valid, url: "https://a.com" })).toContain("A title link needs a title.")
    expect(stickyProblems({ ...valid, headerUrl: "https://a.com" })).toContain("A header link needs header text.")
  })

  it("rejects links that are not http or https", () => {
    const problems = stickyProblems({ ...valid, title: "T", url: "javascript:alert(1)", headerText: "H", headerUrl: "ftp://x" })
    expect(problems).toHaveLength(2)
    expect(stickyBodySchema.safeParse({ ...stickyDraftToBody(valid), url: "javascript:alert(1)" }).success).toBe(false)
  })

  it("caps the total at 6000 characters", () => {
    const over = { ...valid, description: "x".repeat(STICKY_LIMITS.description), footerText: "y".repeat(2000) }
    expect(stickyTotalLength(over)).toBe(6096)
    expect(stickyProblems(over)).toEqual(["Discord caps an embed at 6000 characters. This one is 6096."])
  })

  it("rejects a body over a field limit", () => {
    expect(stickyBodySchema.safeParse({ ...stickyDraftToBody(valid), title: "x".repeat(257) }).success).toBe(false)
  })

  it("maps onto the embed preview with the row's saved images", () => {
    const embed = stickyToEmbedDraft(stickyRowToDraft(row), row)
    expect(embed).toMatchObject({
      name: "",
      fields: [],
      authorName: "Staff",
      authorUrl: "https://example.com/staff",
      authorIconUrl: row.header_icon_url,
      footerIconUrl: row.footer_icon_url,
      thumbnailUrl: row.thumbnail_url,
      imageUrl: row.image_url,
      timestamp: "2026-11-14T10:00:00.000Z",
    })
    expect(stickyToEmbedDraft(valid, null)).toMatchObject({ authorIconUrl: "", thumbnailUrl: "", imageUrl: "" })
  })
})
