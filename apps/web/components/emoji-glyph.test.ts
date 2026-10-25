import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EmojiGlyph } from "./emoji-glyph"

const render = (value: string | null, className?: string) =>
  renderToStaticMarkup(createElement(EmojiGlyph, { value, className }))

describe("EmojiGlyph", () => {
  it("shows a custom emoji as its Discord image, not as markup", () => {
    const html = render("<:frog:1234567890>")
    expect(html).toContain('src="https://cdn.discordapp.com/emojis/1234567890.png"')
    expect(html).toContain('alt="frog"')
    expect(html).not.toContain("&lt;:frog:")
  })

  it("uses the gif for an animated custom emoji", () => {
    expect(render("<a:dance:42>")).toContain("emojis/42.gif")
  })

  it("shows a unicode emoji as a Twemoji image", () => {
    const html = render("🐸")
    expect(html).toContain("<img")
    expect(html).toContain("1f438")
  })

  it("falls back to the text when nothing resolves", () => {
    expect(render("hello")).toBe("<span>hello</span>")
  })

  it("renders nothing without a value", () => {
    expect(render(null)).toBe("")
  })

  it("passes the class to the image", () => {
    expect(render("<:frog:1234567890>", "h-4 w-4")).toContain('class="h-4 w-4"')
  })
})
