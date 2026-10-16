import { describe, it, expect } from "vitest"
import { customEmojiUrl, emojiLabel, parseCustomEmoji } from "./discord-emoji"

describe("parseCustomEmoji", () => {
  it("reads <:name:id>", () => {
    expect(parseCustomEmoji("<:poggers:123456789012345678>")).toEqual({
      name: "poggers",
      id: "123456789012345678",
      animated: false,
    })
  })

  it("reads an animated <a:name:id>", () => {
    expect(parseCustomEmoji("<a:party:123456789012345678>")).toMatchObject({ name: "party", animated: true })
  })

  it("reads the bare name:id form", () => {
    expect(parseCustomEmoji("poggers:123456789012345678")).toEqual({
      name: "poggers",
      id: "123456789012345678",
      animated: false,
    })
  })

  it("does not treat a Unicode emoji, a shortcode or a short id as custom", () => {
    expect(parseCustomEmoji("👍")).toBeNull()
    expect(parseCustomEmoji(":frog:")).toBeNull()
    expect(parseCustomEmoji("<:x:123>")).toBeNull()
  })
})

describe("customEmojiUrl", () => {
  it("points at the Discord CDN, as a gif when animated", () => {
    expect(customEmojiUrl({ name: "a", id: "1".repeat(18), animated: false })).toBe(
      `https://cdn.discordapp.com/emojis/${"1".repeat(18)}.png`
    )
    expect(customEmojiUrl({ name: "a", id: "1".repeat(18), animated: true })).toMatch(/\.gif$/)
  })
})

describe("emojiLabel", () => {
  it("shows a custom emoji as :name: and leaves Unicode alone", () => {
    expect(emojiLabel("<:poggers:123456789012345678>")).toBe(":poggers:")
    expect(emojiLabel("🐸")).toBe("🐸")
  })
})
