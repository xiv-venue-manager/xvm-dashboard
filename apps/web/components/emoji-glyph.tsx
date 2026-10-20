import { customEmojiCdnUrl, parseCustomEmojiMarkup, twemojiCdnUrl } from "@/lib/emoji"

// Ported from FroggeBot Dashboard (src/components/EmojiGlyph.tsx).
//
// Renders a stored emoji value - a Unicode character, or a Discord `<:name:id>` / `<a:name:id>`
// markup string - as an image, so a list does not show the raw markup as literal text. Falls back
// to the value itself when nothing resolves.
export function EmojiGlyph({ value, className }: { value: string | null; className?: string }) {
  if (!value) return null
  const custom = parseCustomEmojiMarkup(value)
  const url = custom ? customEmojiCdnUrl(custom) : twemojiCdnUrl(value)
  if (!url) return <span className={className}>{value}</span>
  // The image is the only content here, so it needs real alt text: the character itself, which a
  // screen reader announces by its Unicode name.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={custom?.name ?? value} className={className} />
}
