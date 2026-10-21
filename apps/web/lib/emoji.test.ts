import { describe, it, expect } from "vitest"
import { customEmojiCdnUrl, customEmojiMarkup, parseCustomEmojiMarkup, twemojiCdnUrl } from "./emoji"

describe("parseCustomEmojiMarkup", () => {
  it("reads a static and an animated custom emoji", () => {
    expect(parseCustomEmojiMarkup("<:frog:1234567890>")).toEqual({ id: "1234567890", name: "frog", animated: false })
    expect(parseCustomEmojiMarkup("<a:dance:987654321>")).toEqual({ id: "987654321", name: "dance", animated: true })
  })

  it("trims surrounding whitespace", () => {
    expect(parseCustomEmojiMarkup("  <:frog:1234567890>  ")?.name).toBe("frog")
  })

  it("returns null for anything that is not custom-emoji markup", () => {
    for (const text of ["", "🎉", "frog", "<:frog>", "<:frog:>", "<::1234567890>", "<:frog:abc>", ":frog:"]) {
      expect(parseCustomEmojiMarkup(text)).toBeNull()
    }
  })

  it("returns null for a name with a space, which Discord does not mint", () => {
    expect(parseCustomEmojiMarkup("<:two words:1234567890>")).toBeNull()
  })
})

describe("customEmojiMarkup and customEmojiCdnUrl", () => {
  const frog = { id: "1234567890", name: "frog", animated: false }
  const dance = { id: "987654321", name: "dance", animated: true }

  it("builds markup for both kinds", () => {
    expect(customEmojiMarkup(frog)).toBe("<:frog:1234567890>")
    expect(customEmojiMarkup(dance)).toBe("<a:dance:987654321>")
  })

  it("serves an animated emoji as a gif and a static one as a png", () => {
    expect(customEmojiCdnUrl(frog)).toBe("https://cdn.discordapp.com/emojis/1234567890.png")
    expect(customEmojiCdnUrl(dance)).toBe("https://cdn.discordapp.com/emojis/987654321.gif")
  })

  it("round-trips through parseCustomEmojiMarkup", () => {
    for (const emoji of [frog, dance]) {
      expect(parseCustomEmojiMarkup(customEmojiMarkup(emoji))).toEqual(emoji)
    }
  })
})

describe("twemojiCdnUrl", () => {
  it("resolves a single-codepoint emoji to a version-pinned asset", () => {
    // Any semver tag, never @latest: a floating tag serves assets the installed library was never
    // checked against. The version comes from the package, so asserting the exact one would break
    // on every bump.
    expect(twemojiCdnUrl("🎉")).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/gh\/jdecked\/twemoji@\d+\.\d+\.\d+\/assets\/72x72\/1f389\.png$/
    )
  })

  it("resolves shapes the raw codepoint conversion gets wrong on its own", () => {
    // A flag is two regional indicators, a ZWJ sequence is several codepoints joined by U+200D,
    // and a skin-tone modifier appends one - all need twemoji's own resolution, not a hex dump.
    for (const emoji of ["🇬🇧", "👨‍👩‍👧", "👍🏽"]) {
      expect(twemojiCdnUrl(emoji)).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.*\/[0-9a-f-]+\.png$/)
    }
  })

  it("resolves the glyph-plus-FE0F emoji the callback path returns empty for", () => {
    // The documented gap the toCodePoint fallback exists for. If twemoji ever fixes its parser
    // these keep passing through the callback instead, so this pins the behaviour, not the route.
    for (const emoji of ["🖐️", "✌️", "☝️"]) {
      expect(twemojiCdnUrl(emoji)).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.*\.png$/)
      expect(twemojiCdnUrl(emoji)).not.toMatch(/fe0f\.png$/)
    }
  })

  it("returns null for text with no emoji in it, including custom-emoji markup", () => {
    for (const text of ["", "hello", "<:frog:1234567890>"]) {
      expect(twemojiCdnUrl(text)).toBeNull()
    }
  })
})
