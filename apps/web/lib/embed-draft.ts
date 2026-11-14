import { z } from "zod"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import type { EmbedRow, EmbedWrite } from "@/lib/api/xvm-api"

export const EMBED_LIMITS = {
  name: 100,
  title: 256,
  description: 4096,
  author: 256,
  footer: 2048,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
  url: 500,
} as const

export interface EmbedDraftField {
  name: string
  value: string
  inline: boolean
}

export interface EmbedDraft {
  name: string
  title: string
  description: string
  color: string
  url: string
  authorName: string
  authorIconUrl: string
  authorUrl: string
  footerText: string
  footerIconUrl: string
  thumbnailUrl: string
  imageUrl: string
  timestamp: string
  fields: EmbedDraftField[]
}

export const emptyDraft: EmbedDraft = {
  name: "",
  title: "",
  description: "",
  color: "",
  url: "",
  authorName: "",
  authorIconUrl: "",
  authorUrl: "",
  footerText: "",
  footerIconUrl: "",
  thumbnailUrl: "",
  imageUrl: "",
  timestamp: "",
  fields: [],
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function rowToDraft(row: EmbedRow): EmbedDraft {
  return {
    name: row.name,
    title: row.title ?? "",
    description: row.description ?? "",
    color: row.color === null ? "" : colorToHex(row.color),
    url: row.url ?? "",
    authorName: row.header_text ?? "",
    authorIconUrl: row.header_icon_url ?? "",
    authorUrl: row.header_url ?? "",
    footerText: row.footer_text ?? "",
    footerIconUrl: row.footer_icon_url ?? "",
    thumbnailUrl: row.thumbnail_url ?? "",
    imageUrl: row.image_url ?? "",
    timestamp: row.timestamp_at ?? "",
    fields: [...row.fields]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((field) => ({ name: field.name, value: field.value, inline: field.inline })),
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function draftToBody(draft: EmbedDraft) {
  return {
    name: draft.name.trim(),
    title: orNull(draft.title),
    description: orNull(draft.description),
    color: draft.color === "" ? null : hexToColor(draft.color),
    url: orNull(draft.url),
    authorName: orNull(draft.authorName),
    authorIconUrl: orNull(draft.authorIconUrl),
    authorUrl: orNull(draft.authorUrl),
    footerText: orNull(draft.footerText),
    footerIconUrl: orNull(draft.footerIconUrl),
    thumbnailUrl: orNull(draft.thumbnailUrl),
    imageUrl: orNull(draft.imageUrl),
    timestamp: draft.timestamp === "" ? null : draft.timestamp,
    fields: draft.fields.map((field) => ({ name: field.name, value: field.value, inline: field.inline })),
  }
}

export type EmbedBody = ReturnType<typeof draftToBody>

const link = z
  .string()
  .max(EMBED_LIMITS.url)
  .refine(isHttpUrl, { message: "Must be an http or https address" })
  .nullable()

export const embedBodySchema = z.object({
  name: z.string().trim().min(1).max(EMBED_LIMITS.name),
  title: z.string().max(EMBED_LIMITS.title).nullable(),
  description: z.string().max(EMBED_LIMITS.description).nullable(),
  color: z.number().int().min(0).max(0xffffff).nullable(),
  url: link,
  authorName: z.string().max(EMBED_LIMITS.author).nullable(),
  authorIconUrl: link,
  authorUrl: link,
  footerText: z.string().max(EMBED_LIMITS.footer).nullable(),
  footerIconUrl: link,
  thumbnailUrl: link,
  imageUrl: link,
  timestamp: z.string().datetime({ offset: true }).nullable(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(EMBED_LIMITS.fieldName),
        value: z.string().min(1).max(EMBED_LIMITS.fieldValue),
        inline: z.boolean(),
      })
    )
    .max(EMBED_LIMITS.fields),
})

export function bodyToApi(body: EmbedBody): EmbedWrite {
  return {
    name: body.name,
    title: body.title,
    description: body.description,
    color: body.color,
    url: body.url,
    timestamp_at: body.timestamp,
    header_text: body.authorName,
    header_icon_url: body.authorIconUrl,
    header_url: body.authorUrl,
    footer_text: body.footerText,
    footer_icon_url: body.footerIconUrl,
    thumbnail_url: body.thumbnailUrl,
    image_url: body.imageUrl,
    fields: body.fields,
  }
}

export function embedTotalLength(draft: EmbedDraft): number {
  const parts = [
    draft.title,
    draft.description,
    draft.authorName,
    draft.footerText,
    ...draft.fields.flatMap((field) => [field.name, field.value]),
  ]
  return parts.reduce((total, part) => total + part.length, 0)
}

const LINKS: { key: keyof EmbedDraft; label: string }[] = [
  { key: "url", label: "The title link" },
  { key: "authorIconUrl", label: "The author icon" },
  { key: "authorUrl", label: "The author link" },
  { key: "footerIconUrl", label: "The footer icon" },
  { key: "thumbnailUrl", label: "The thumbnail" },
  { key: "imageUrl", label: "The image" },
]

export function embedProblems(draft: EmbedDraft): string[] {
  const problems: string[] = []
  if (draft.name.trim() === "") problems.push("Give the embed a name.")
  if (draft.url.trim() !== "" && draft.title.trim() === "") problems.push("A title link needs a title.")
  if ((draft.authorIconUrl.trim() !== "" || draft.authorUrl.trim() !== "") && draft.authorName.trim() === "") {
    problems.push("An author icon or link needs an author name.")
  }
  if (draft.footerIconUrl.trim() !== "" && draft.footerText.trim() === "") {
    problems.push("A footer icon needs footer text.")
  }
  for (const { key, label } of LINKS) {
    const value = String(draft[key]).trim()
    if (value !== "" && !isHttpUrl(value)) {
      problems.push(`${label} needs a web address starting with http:// or https://.`)
    }
  }
  draft.fields.forEach((field, index) => {
    if (field.name.trim() === "" || field.value.trim() === "") {
      problems.push(`Field ${index + 1} needs both a name and a value.`)
    }
  })
  const total = embedTotalLength(draft)
  if (total > EMBED_LIMITS.total) {
    problems.push(`Discord caps an embed at ${EMBED_LIMITS.total} characters. This one is ${total}.`)
  }
  return problems
}
