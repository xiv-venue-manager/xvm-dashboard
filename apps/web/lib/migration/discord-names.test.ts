import { describe, it, expect } from "vitest"
import { applyDiscordNames } from "./discord-names"

const file = {
  people: [
    { key: "a", display_name: "Discord user 1" },
    { key: "b", display_name: "Discord user 2" },
    { key: "c", display_name: "Discord user 3" },
    { key: "d", display_name: "Real Name" },
  ],
  discordAccounts: [{ person_key: "a", provider: "discord", external_id: "1" }],
}
const ok = (global_name: string, username: string) => ({ global_name, username, status: "ok" })

describe("applyDiscordNames", () => {
  it("names placeholders from the display name, then the username, and leaves the rest alone", () => {
    const names = { "1": ok("Nova", "nova_1"), "2": ok("", "plain_user"), "3": { global_name: "", username: "", status: "http_404" }, "4": ok("Other", "other") }
    const { file: out, named, unresolved } = applyDiscordNames(file, names)
    expect(out.people.map((p) => p.display_name)).toEqual(["Nova", "plain_user", "Discord user 3", "Real Name"])
    expect(named).toBe(2)
    expect(unresolved).toEqual(["Discord user 3"])
  })
})
