import { describe, it, expect } from "vitest"
import {
  EMBED_LIMITS,
  bodyToApi,
  draftToBody,
  embedBodySchema,
  embedProblems,
  embedTotalLength,
  emptyDraft,
  isHttpUrl,
  rowToDraft,
} from "./embed-draft"
import type { EmbedRow } from "./api/xvm-api"

const row: EmbedRow = {
  id: 4,
  name: "Welcome",
  title: "Hello",
  description: "Body text",
  color: 0xff8800,
  url: "https://example.com",
  timestamp_at: "2026-11-14T10:00:00Z",
  header_text: "Author",
  header_icon_url: "https://example.com/a.png",
  header_url: "https://example.com/author",
  footer_text: "Footer",
  footer_icon_url: "https://example.com/f.png",
  thumbnail_url: "https://example.com/t.png",
  image_url: "https://example.com/i.png",
  fields: [{ id: 1, name: "Rule", value: "Be kind", inline: false, sort_order: 0 }],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
}

describe("rowToDraft", () => {
  it("turns an xvm-api row into editable strings", () => {
    const draft = rowToDraft(row)
    expect(draft.color).toBe("#ff8800")
    expect(draft.authorName).toBe("Author")
    expect(draft.timestamp).toBe("2026-11-14T10:00:00Z")
    expect(draft.fields).toEqual([{ name: "Rule", value: "Be kind", inline: false }])
  })

  it("uses empty strings for nulls", () => {
    const draft = rowToDraft({ ...row, title: null, color: null, timestamp_at: null, header_text: null })
    expect(draft.title).toBe("")
    expect(draft.color).toBe("")
    expect(draft.timestamp).toBe("")
    expect(draft.authorName).toBe("")
  })
})

describe("draftToBody", () => {
  it("turns blank text into null so a PATCH clears it", () => {
    const body = draftToBody({ ...emptyDraft, name: "  Plain  " })
    expect(body.name).toBe("Plain")
    expect(body.title).toBeNull()
    expect(body.color).toBeNull()
    expect(body.timestamp).toBeNull()
    expect(body.fields).toEqual([])
  })

  it("round trips a row", () => {
    const body = draftToBody(rowToDraft(row))
    expect(body.color).toBe(0xff8800)
    expect(body.authorIconUrl).toBe("https://example.com/a.png")
    expect(body.fields).toEqual([{ name: "Rule", value: "Be kind", inline: false }])
  })
})

describe("bodyToApi", () => {
  it("maps the browser's names to xvm-api's", () => {
    const api = bodyToApi(draftToBody(rowToDraft(row)))
    expect(api).toMatchObject({
      name: "Welcome",
      header_text: "Author",
      header_icon_url: "https://example.com/a.png",
      header_url: "https://example.com/author",
      footer_icon_url: "https://example.com/f.png",
      thumbnail_url: "https://example.com/t.png",
      image_url: "https://example.com/i.png",
      timestamp_at: "2026-11-14T10:00:00Z",
      color: 0xff8800,
    })
  })
})

describe("embedTotalLength", () => {
  it("counts title, description, author, footer and every field the way xvm-api does", () => {
    const draft = {
      ...emptyDraft,
      title: "abc",
      description: "defg",
      authorName: "hi",
      footerText: "jkl",
      url: "https://not-counted.example.com",
      fields: [{ name: "mn", value: "opqr", inline: true }],
    }
    expect(embedTotalLength(draft)).toBe(3 + 4 + 2 + 3 + 2 + 4)
  })
})

describe("embedProblems", () => {
  it("is empty for a valid embed", () => {
    expect(embedProblems({ ...emptyDraft, name: "Ok", title: "T" })).toEqual([])
  })

  it("needs a name", () => {
    expect(embedProblems(emptyDraft)).toContain("Give the embed a name.")
  })

  it("applies Discord's dependency rules", () => {
    const problems = embedProblems({
      ...emptyDraft,
      name: "Ok",
      url: "https://example.com",
      authorIconUrl: "https://example.com/a.png",
      footerIconUrl: "https://example.com/f.png",
    })
    expect(problems).toContain("A title link needs a title.")
    expect(problems).toContain("An author icon or link needs an author name.")
    expect(problems).toContain("A footer icon needs footer text.")
  })

  it("rejects an address that is not http or https", () => {
    expect(embedProblems({ ...emptyDraft, name: "Ok", imageUrl: "ftp://example.com/x.png" })).toContain(
      "The image needs a web address starting with http:// or https://."
    )
  })

  it("rejects an embed over Discord's budget", () => {
    const problems = embedProblems({ ...emptyDraft, name: "Ok", description: "x".repeat(EMBED_LIMITS.total + 1) })
    expect(problems.some((p) => p.includes("6000"))).toBe(true)
  })
})

describe("isHttpUrl", () => {
  it("accepts only http and https", () => {
    expect(isHttpUrl("https://example.com/a.png")).toBe(true)
    expect(isHttpUrl("http://example.com")).toBe(true)
    expect(isHttpUrl("ftp://example.com")).toBe(false)
    expect(isHttpUrl("example.com")).toBe(false)
    expect(isHttpUrl("")).toBe(false)
  })
})

describe("embedBodySchema", () => {
  it("accepts a full body", () => {
    expect(embedBodySchema.safeParse(draftToBody(rowToDraft(row))).success).toBe(true)
  })

  it("rejects an over-long title, a bad colour, a bad link and too many fields", () => {
    const base = draftToBody(rowToDraft(row))
    expect(embedBodySchema.safeParse({ ...base, title: "x".repeat(257) }).success).toBe(false)
    expect(embedBodySchema.safeParse({ ...base, color: 0x1000000 }).success).toBe(false)
    expect(embedBodySchema.safeParse({ ...base, imageUrl: "javascript:alert(1)" }).success).toBe(false)
    expect(
      embedBodySchema.safeParse({ ...base, fields: Array.from({ length: 26 }, () => ({ name: "a", value: "b", inline: true })) })
        .success
    ).toBe(false)
  })
})

describe("extra coverage", () => {
  it("flags a blank field name or value", () => {
    const problems = embedProblems({ ...emptyDraft, name: "Ok", fields: [{ name: "", value: "v", inline: true }] })
    expect(problems).toContain("Field 1 needs both a name and a value.")
  })

  it("rejects more than the field limit", () => {
    const fields = Array.from({ length: EMBED_LIMITS.fields + 1 }, () => ({ name: "a", value: "b", inline: true }))
    expect(embedBodySchema.safeParse({ ...draftToBody({ ...emptyDraft, name: "Ok" }), fields }).success).toBe(false)
  })

  it("sends null for every cleared image and text link", () => {
    const api = bodyToApi(draftToBody({ ...emptyDraft, name: "Ok" }))
    for (const key of [
      "header_text",
      "header_icon_url",
      "header_url",
      "footer_text",
      "footer_icon_url",
      "thumbnail_url",
      "image_url",
    ] as const) {
      expect(api[key]).toBeNull()
    }
  })

  it("accepts a timestamp straight from toISOString", () => {
    const body = draftToBody({ ...emptyDraft, name: "Ok", timestamp: new Date().toISOString() })
    expect(embedBodySchema.safeParse(body).success).toBe(true)
  })
})
