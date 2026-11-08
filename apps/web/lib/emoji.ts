// Ported from FroggeBot Dashboard (src/lib/emoji.ts). Pure, no I/O, no bot token - so a Client
// Component can import it, which `lib/discord-rest.ts` must never be (it holds the token).
// `DiscordEmojiOption` lives here rather than there for that reason; discord-rest re-exports it
// for its existing callers.

import { parse, toCodePoints } from "@twemoji/parser"

export interface DiscordEmojiOption {
  id: string
  name: string
  animated: boolean
}

export function customEmojiCdnUrl(emoji: DiscordEmojiOption): string {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}`
}

export function customEmojiMarkup(emoji: DiscordEmojiOption): string {
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`
}

const CUSTOM_EMOJI_MARKUP = /^<(a)?:(\w+):(\d+)>$/

// A custom emoji's markup already carries the id and animated flag a preview needs, so this
// parses the field's own text rather than waiting on the fetched emoji list.
export function parseCustomEmojiMarkup(text: string): DiscordEmojiOption | null {
  const match = CUSTOM_EMOJI_MARKUP.exec(text.trim())
  if (!match) return null
  const [, animatedFlag, name, id] = match
  return { id, name, animated: animatedFlag === "a" }
}

const TWEMOJI_ASSET_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/"

export function twemojiCdnUrl(text: string): string | null {
  const entities = parse(text, { assetType: "png", buildUrl: (codepoints) => `${TWEMOJI_ASSET_BASE}${codepoints}.png` })
  if (entities.length === 0) return null
  const resolved = entities.find((entity) => entity.url)
  if (resolved) return resolved.url
  const fallback = toCodePoints(text).join("-").replace(/-?fe0f$/i, "")
  return fallback ? `${TWEMOJI_ASSET_BASE}${fallback}.png` : null
}
