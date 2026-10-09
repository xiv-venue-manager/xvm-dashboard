import { describe, it, expect } from "vitest"
import { mapPeople, type ExportedUser } from "./people"

const user = (over: Partial<ExportedUser> = {}): ExportedUser => ({
  id: "u1",
  name: "ash_discord",
  displayName: null,
  discordId: "111111111111111111",
  discordAccountId: "111111111111111111",
  email: null,
  isAdmin: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  hasReferences: true,
  ...over,
})

const run = (users: ExportedUser[], payees: string[] = []) => mapPeople({ users, payees })

describe("mapPeople users", () => {
  it("makes a person with a discord account", () => {
    const r = run([user()])
    expect(r.people).toEqual([
      { key: "u1", kind: "user", display_name: "ash_discord", is_platform_admin: false, created_at: "2026-01-01T00:00:00.000Z" },
    ])
    expect(r.discordAccounts).toEqual([{ person_key: "u1", provider: "discord", external_id: "111111111111111111" }])
    expect(r.warnings).toEqual([])
  })

  it("prefers displayName over name, and collapses whitespace", () => {
    const r = run([user({ displayName: "  Ash   Vale " })])
    expect(r.people[0].display_name).toBe("Ash Vale")
  })

  it("falls back to name when displayName is blank", () => {
    expect(run([user({ displayName: "   " })]).people[0].display_name).toBe("ash_discord")
  })

  it("uses a placeholder and warns when there is no name at all", () => {
    const r = run([user({ id: "cmabc123456", name: null })])
    expect(r.people[0].display_name).toBe("User 123456")
    expect(r.warnings).toHaveLength(1)
  })

  it("cuts a display name over 100 characters and warns", () => {
    const r = run([user({ displayName: "x".repeat(120) })])
    expect(r.people[0].display_name).toHaveLength(100)
    expect(r.warnings[0].message).toContain("cut")
  })

  it("carries the platform admin flag", () => {
    expect(run([user({ isAdmin: true })]).people[0].is_platform_admin).toBe(true)
  })

  it("skips a user nothing references, unless they are an admin", () => {
    const r = run([
      user({ id: "a", hasReferences: false }),
      user({ id: "b", hasReferences: false, isAdmin: true, discordId: null, discordAccountId: null }),
    ])
    expect(r.skipped).toEqual([{ key: "a", reason: "unreferenced" }])
    expect(r.people.map((p) => p.key)).toEqual(["b"])
  })

  it("loads a person with no discord identity, with a warning and no account", () => {
    const r = run([user({ discordId: null, discordAccountId: null })])
    expect(r.people).toHaveLength(1)
    expect(r.discordAccounts).toEqual([])
    expect(r.warnings[0].message).toContain("no discord identity")
  })

  it("uses the accounts row when it differs from the users column, and warns", () => {
    const r = run([user({ discordId: "222222222222222222", discordAccountId: "111111111111111111" })])
    expect(r.discordAccounts[0].external_id).toBe("111111111111111111")
    expect(r.warnings[0].message).toContain("differs")
  })

  it("falls back to the users column when there is no accounts row", () => {
    const r = run([user({ discordAccountId: null })])
    expect(r.discordAccounts[0].external_id).toBe("111111111111111111")
  })

  it("rejects an id that is not a snowflake", () => {
    const r = run([user({ discordId: "../../9", discordAccountId: null })])
    expect(r.discordAccounts).toEqual([])
    expect(r.warnings[0].message).toContain("not a snowflake")
  })

  it("gives a shared discord id to the earlier user only", () => {
    const r = run([
      user({ id: "late", createdAt: "2026-03-01T00:00:00.000Z" }),
      user({ id: "early", createdAt: "2026-01-01T00:00:00.000Z" }),
    ])
    expect(r.discordAccounts.map((a) => a.person_key)).toEqual(["early"])
    expect(r.people.map((p) => p.key)).toEqual(["early", "late"])
    expect(r.warnings.map((w) => w.key)).toEqual(["late"])
  })
})

describe("mapPeople email", () => {
  it("emits email accounts separately, lower-cased", () => {
    const r = run([user({ email: " Ash@Example.COM " })])
    expect(r.emailAccounts).toEqual([{ person_key: "u1", provider: "email", external_id: "ash@example.com" }])
    expect(r.discordAccounts).toHaveLength(1)
  })

  it("drops a second user's duplicate address, case-insensitively", () => {
    const r = run([
      user({ id: "a", email: "x@example.com", createdAt: "2026-01-01T00:00:00.000Z" }),
      user({ id: "b", email: "X@example.com", discordId: "2", discordAccountId: "2", createdAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(r.emailAccounts.map((a) => a.person_key)).toEqual(["a"])
    expect(r.warnings.map((w) => w.key)).toEqual(["b"])
  })

  it("ignores something that is not an address", () => {
    const r = run([user({ email: "nope" })])
    expect(r.emailAccounts).toEqual([])
    expect(r.warnings[0].message).toContain("not an address")
  })
})

describe("mapPeople payees", () => {
  it("makes an accountless person per distinct payee name", () => {
    const r = run([], ["DJ Kestrel", "dj  kestrel", "  ", "Moss"])
    expect(r.people.map((p) => [p.key, p.display_name, p.created_at])).toEqual([
      ["payee:dj kestrel", "DJ Kestrel", null],
      ["payee:moss", "Moss", null],
    ])
    expect(r.discordAccounts).toEqual([])
  })

  it("flags a payee whose name matches a loaded user", () => {
    const r = run([user({ displayName: "Moss" })], ["moss"])
    expect(r.warnings.map((w) => w.key)).toEqual(["payee:moss"])
    expect(r.people).toHaveLength(2)
  })
})
