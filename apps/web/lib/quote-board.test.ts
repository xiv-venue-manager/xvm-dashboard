import { describe, it, expect } from "vitest"
import { QUOTE_PAGE_SIZE, discordMessageUrl, hasMoreQuotes } from "./quote-board"

describe("discordMessageUrl", () => {
  it("links to the message in the server", () => {
    expect(discordMessageUrl("111", "222", "333")).toBe("https://discord.com/channels/111/222/333")
  })
})

describe("hasMoreQuotes", () => {
  it("is true when a page came back full", () => {
    expect(hasMoreQuotes(QUOTE_PAGE_SIZE)).toBe(true)
  })

  it("is false when a page came back short", () => {
    expect(hasMoreQuotes(QUOTE_PAGE_SIZE - 1)).toBe(false)
    expect(hasMoreQuotes(0)).toBe(false)
  })
})
