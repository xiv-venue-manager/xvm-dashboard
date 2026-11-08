import { describe, expect, it } from "vitest"
import { frogScope, parseActivity } from "./frogge-scope"

const activity = parseActivity(
  [
    "positions|1|2",
    "events|1|1",
    "guild_welcome_posts|1|1",
    "profile_characters|2|1",
    "message_templates|2|2",
    "guild_welcome_posts|2|1",
    "leveling_settings|3|1",
    "quote_board_settings|3|1",
    "rooms|4|1",
    "finance_transactions|5|1",
    "positions|6|1",
    "",
  ].join("\n")
)

describe("frogScope", () => {
  it("loads a server with venue data and leaves out one with only a profile, a template or defaults", () => {
    const r = frogScope(activity, { "1": "ok", "4": "ok", "5": "ok", "6": "ok" }, new Set(["1"]))
    expect(r.include.map((s) => s.guildId)).toEqual(["1", "4", "5", "6"])
    expect(r.leftOut).toBe(2)
    expect(r.include[0].tables).toEqual({ positions: 2, events: 1 })
  })

  it("skips a server whose owner the bot cannot reach, and lists one nobody has looked up", () => {
    const r = frogScope(activity, { "1": "ok", "4": "http_404" }, new Set())
    expect(r.botGone.map((s) => s.guildId)).toEqual(["4"])
    expect(r.needsOwnerLookup).toEqual(["5", "6"])
    expect(r.include.map((s) => s.guildId)).toEqual(["1", "5", "6"])
  })

  it("shows what changes against the current list", () => {
    const r = frogScope(activity, {}, new Set(["1", "2"]))
    expect(r.added).toEqual(["4", "5", "6"])
    expect(r.dropped).toEqual(["2"])
  })

  it("does not keep a server on the current list whose owner the bot cannot reach", () => {
    const r = frogScope(activity, { "1": "ok", "2": "http_404" }, new Set(["1", "2"]))
    expect(r.botGone.map((s) => s.guildId)).toEqual(["2"])
    expect(r.include.map((s) => s.guildId)).not.toContain("2")
    expect(r.dropped).toEqual([])
  })
})
