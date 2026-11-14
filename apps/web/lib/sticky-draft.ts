import { z } from "zod"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import { EMBED_LIMITS, emptyDraft, isHttpUrl, type EmbedDraft } from "@/lib/embed-draft"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import type { StickyRow } from "@/lib/api/xvm-api"

export const STICKY_LIMITS = {
  title: EMBED_LIMITS.title,
  description: EMBED_LIMITS.description,
  header: EMBED_LIMITS.author,
  footer: EMBED_LIMITS.footer,
  url: EMBED_LIMITS.url,
  total: EMBED_LIMITS.total,
} as const

export interface StickyDraft {
  channelId: string
  enabled: boolean
  title: string
  description: string
  color: string
  url: string
  headerText: string
  headerUrl: string
  footerText: string
  timestamp: string
}

export const emptyStickyDraft: StickyDraft = {
  channelId: "",
  enabled: true,
  title: "",
  description: "",
  color: "",
  url: "",
  headerText: "",
  headerUrl: "",
  footerText: "",
  timestamp: "",
}

export function stickyRowToDraft(row: StickyRow): StickyDraft {
  return {
    channelId: row.channel_id,
    enabled: row.enabled,
    title: row.title ?? "",
    description: row.description ?? "",
    color: row.color === null ? "" : colorToHex(row.color),
    url: row.url ?? "",
    headerText: row.header_text ?? "",
    headerUrl: row.header_url ?? "",
    footerText: row.footer_text ?? "",
    timestamp: row.timestamp_at ?? "",
  }
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function stickyDraftToBody(draft: StickyDraft) {
  return {
    channel_id: draft.channelId.trim(),
    enabled: draft.enabled,
    title: orNull(draft.title),
    description: orNull(draft.description),
    color: draft.color === "" ? null : hexToColor(draft.color),
    url: orNull(draft.url),
    timestamp_at: draft.timestamp === "" ? null : draft.timestamp,
    header_text: orNull(draft.headerText),
    header_url: orNull(draft.headerUrl),
    footer_text: orNull(draft.footerText),
  }
}

export type StickyBody = ReturnType<typeof stickyDraftToBody>

const link = z
  .string()
  .max(STICKY_LIMITS.url)
  .refine(isHttpUrl, { message: "Must be an http or https address" })
  .nullable()

export const stickyBodySchema = z.object({
  channel_id: z.string().regex(SNOWFLAKE_PATTERN, "Must be a numeric Discord ID").max(20),
  enabled: z.boolean(),
  title: z.string().max(STICKY_LIMITS.title).nullable(),
  description: z.string().max(STICKY_LIMITS.description).nullable(),
  color: z.number().int().min(0).max(0xffffff).nullable(),
  url: link,
  timestamp_at: z.string().datetime({ offset: true }).nullable(),
  header_text: z.string().max(STICKY_LIMITS.header).nullable(),
  header_url: link,
  footer_text: z.string().max(STICKY_LIMITS.footer).nullable(),
})

export function stickyTotalLength(draft: StickyDraft): number {
  return [draft.title, draft.description, draft.headerText, draft.footerText].reduce((total, part) => total + part.length, 0)
}

export function stickyProblems(draft: StickyDraft): string[] {
  const problems: string[] = []
  const channel = draft.channelId.trim()
  if (channel === "") problems.push("Pick the channel.")
  else if (!SNOWFLAKE_PATTERN.test(channel)) problems.push("The channel needs a numeric Discord ID.")
  if (draft.url.trim() !== "" && draft.title.trim() === "") problems.push("A title link needs a title.")
  if (draft.headerUrl.trim() !== "" && draft.headerText.trim() === "") problems.push("A header link needs header text.")
  for (const [value, label] of [
    [draft.url, "The title link"],
    [draft.headerUrl, "The header link"],
  ] as const) {
    if (value.trim() !== "" && !isHttpUrl(value.trim())) {
      problems.push(`${label} needs a web address starting with http:// or https://.`)
    }
  }
  const total = stickyTotalLength(draft)
  if (total > STICKY_LIMITS.total) {
    problems.push(`Discord caps an embed at ${STICKY_LIMITS.total} characters. This one is ${total}.`)
  }
  return problems
}

export function stickyToEmbedDraft(draft: StickyDraft, row: StickyRow | null): EmbedDraft {
  return {
    ...emptyDraft,
    title: draft.title,
    description: draft.description,
    color: draft.color,
    url: draft.url,
    authorName: draft.headerText,
    authorUrl: draft.headerUrl,
    authorIconUrl: row?.header_icon_url ?? "",
    footerText: draft.footerText,
    footerIconUrl: row?.footer_icon_url ?? "",
    thumbnailUrl: row?.thumbnail_url ?? "",
    imageUrl: row?.image_url ?? "",
    timestamp: draft.timestamp,
  }
}
