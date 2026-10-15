import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ listMemberships: vi.fn() }))

vi.mock("@/lib/api/xvm-api", () => ({ listMemberships: m.listMemberships }))

import { resolveEntryNames } from "./resolve-entry-names"
import type { EntryRow } from "@/lib/api/xvm-api"

const entry = (discord_user_id: string): EntryRow => ({ discord_user_id }) as EntryRow
const member = (discordId: string | null, displayName: string, nickname: string | null = null) => ({
  nickname,
  person: { id: 1, display_name: displayName, discord_id: discordId },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("resolveEntryNames", () => {
  it("names a member by the venue's nickname for them, else their display name", async () => {
    m.listMemberships.mockResolvedValue([member("1", "Alice A", "Ali"), member("2", "Bob B")])
    const out = await resolveEntryNames("tok", "xv-1", [entry("1"), entry("2")])
    expect(out.map((e) => e.display_name)).toEqual(["Ali", "Bob B"])
    expect(m.listMemberships).toHaveBeenCalledWith("tok", "xv-1")
  })

  it("leaves an entrant who is not a member null, for the caller's Discord fallback", async () => {
    m.listMemberships.mockResolvedValue([member("1", "Alice A")])
    const out = await resolveEntryNames("tok", "xv-1", [entry("9")])
    expect(out[0].display_name).toBeNull()
  })

  it("ignores members whose Discord id is hidden from the reader", async () => {
    m.listMemberships.mockResolvedValue([member(null, "Hidden H")])
    const out = await resolveEntryNames("tok", "xv-1", [entry("1")])
    expect(out[0].display_name).toBeNull()
  })

  it("returns the entries with null names when the roster read fails", async () => {
    m.listMemberships.mockRejectedValue(new Error("down"))
    const out = await resolveEntryNames("tok", "xv-1", [entry("1")])
    expect(out).toHaveLength(1)
    expect(out[0].display_name).toBeNull()
  })

  it("does not read the roster for an empty entry list", async () => {
    expect(await resolveEntryNames("tok", "xv-1", [])).toEqual([])
    expect(m.listMemberships).not.toHaveBeenCalled()
  })
})
