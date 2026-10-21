// Ported from FroggeBot Dashboard (src/lib/emoji.ts). Pure, no I/O, no bot token - so a Client
// Component can import it, which `lib/discord-rest.ts` must never be (it holds the token).
// `DiscordEmojiOption` lives here rather than there for that reason; discord-rest re-exports it
// for its existing callers.

import twemoji from "@twemoji/api"

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

// Unicode emoji render as Twemoji images rather than raw glyphs: Windows' Segoe UI Emoji lags
// the Unicode Consortium badly enough that newer emoji show as blank boxes, and Discord draws
// this same set, so the picker matches what gets posted.
//
// Resolution goes through twemoji.parse()'s callback rather than convert.toCodePoint(), because
// the raw UTF-16-to-hex conversion does not replicate twemoji's variation-selector (U+FE0F)
// stripping rules for asset filenames and can silently name a file that is not hosted. The
// generated HTML is discarded; only the callback's codepoint is used.
//
// Frogge verified against the full unicode-emoji-json list that the callback returns empty for
// ten single-glyph-plus-FE0F emoji (a gap in twemoji's own parsing), so toCodePoint with its
// trailing "-fe0f" stripped is the fallback - never the primary path, since it does not strip
// reliably for ZWJ sequences, flags or skin-tone modifiers.
//
// The fallback is gated on twemoji.test because toCodePoint hex-dumps whatever it is given:
// without the gate "hello" resolves to 68-65-6c-6c-6f.png and every caller renders a broken
// image instead of falling back to text. Diverges from Frogge, which has the bug.
//
// Returns null when nothing resolves, so callers can fall back to plain text.
export function twemojiCdnUrl(text: string): string | null {
  let icon: string | null = null
  twemoji.parse(text, {
    callback: (foundIcon) => {
      icon = foundIcon
      return false
    },
  })
  if (!icon && twemoji.test(text)) {
    const fallback = twemoji.convert.toCodePoint(text).replace(/-?fe0f$/i, "")
    icon = fallback || null
  }
  // twemoji.base carries the package's own pinned asset version, so glyphs and library stay in step.
  return icon ? `${twemoji.base}${twemoji.size}/${icon}${twemoji.ext}` : null
}
