export interface CustomEmoji {
  name: string
  id: string
  animated: boolean
}

const CUSTOM = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,20})>$|^()([A-Za-z0-9_]{2,32}):(\d{15,20})$/

export function parseCustomEmoji(emoji: string): CustomEmoji | null {
  const match = CUSTOM.exec(emoji)
  if (!match) return null
  const [, animated, name, id, , bareName, bareId] = match
  return { name: name ?? bareName, id: id ?? bareId, animated: animated === "a" }
}

export function customEmojiUrl(custom: CustomEmoji): string {
  return `https://cdn.discordapp.com/emojis/${custom.id}.${custom.animated ? "gif" : "png"}`
}

export function emojiLabel(emoji: string): string {
  const custom = parseCustomEmoji(emoji)
  return custom ? `:${custom.name}:` : emoji
}
