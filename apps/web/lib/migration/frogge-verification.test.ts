import { describe, it, expect } from "vitest"
import { mapFroggeVerification, type FroggeVerificationExport } from "./frogge-verification"

const G = "1111111111111111111"
const U1 = "2222222222222222222"
const U2 = "3333333333333333333"
const ctx = {
  venueKeyByGuild: { [G]: "venue-a" },
  personByDiscord: new Map([
    [U1, "p1"],
    [U2, "p2"],
  ]),
}
const record = (over: Partial<FroggeVerificationExport["verification_records"][number]> = {}) => ({
  id: 1,
  guild_id: G,
  discord_user_id: U1,
  character_name: "Test Char",
  lodestone_id: 12345678,
  world: "Adamantoise",
  verified_at: "2026-01-24T10:00:00+00:00",
  proof_method: "lodestone_code",
  ...over,
})
const settings = (over: Partial<FroggeVerificationExport["verification_settings"][number]> = {}) => ({
  guild_id: G,
  require_captcha: false,
  require_lodestone_proof: false,
  require_lodestone_verification: false,
  change_name: false,
  verified_role_id: null,
  ...over,
})
const run = (
  over: Partial<FroggeVerificationExport>,
  characters: Record<string, unknown>[] = [],
  discordSettings: Record<string, unknown>[] = []
) => mapFroggeVerification({ verification_records: [], verification_settings: [], ...over }, ctx, characters, discordSettings)

describe("verified characters", () => {
  it("adds a verified character for a person in the load, not primary", () => {
    const r = run({ verification_records: [record()] })
    expect(r.characters).toEqual([
      {
        person_key: "p1",
        character_name: "Test Char",
        world: "Adamantoise",
        is_primary: false,
        verified_via: "lodestone",
        lodestone_id: "12345678",
        verified_at: "2026-01-24T10:00:00+00:00",
      },
    ])
    expect(r.report.counts["verified characters added"]).toBe(1)
  })

  it("upgrades the person's own row for the same character, ignoring case", () => {
    const existing = {
      person_key: "p1",
      character_name: "test char",
      world: "adamantoise",
      is_primary: true,
      verified_via: "self_declared",
    }
    const r = run({ verification_records: [record()] }, [existing])
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0]).toMatchObject({ is_primary: true, verified_via: "lodestone", lodestone_id: "12345678" })
    expect(existing.verified_via).toBe("self_declared")
  })

  it("leaves records that are not a Lodestone code or have no Lodestone id", () => {
    const r = run({
      verification_records: [
        record({ id: 1, proof_method: "claimed", lodestone_id: null }),
        record({ id: 2, lodestone_id: null }),
      ],
    })
    expect(r.characters).toEqual([])
    expect(r.report.dropped).toEqual([{ what: "verified characters", id: "2", reason: "no Lodestone id" }])
  })

  it("skips a person who is not in the load", () => {
    const r = run({ verification_records: [record({ discord_user_id: "9" })] })
    expect(r.characters).toEqual([])
    expect(r.report.dropped[0].reason).toBe("person not loaded")
  })

  it("keeps the earliest verification when one Lodestone character is verified twice", () => {
    const r = run({
      verification_records: [
        record({ id: 2, verified_at: "2026-03-01T00:00:00+00:00", discord_user_id: U2 }),
        record({ id: 1, verified_at: "2026-02-01T00:00:00+00:00" }),
        record({ id: 3, verified_at: "2026-04-01T00:00:00+00:00" }),
      ],
    })
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].person_key).toBe("p1")
    expect(r.report.dropped.map((d) => d.reason)).toEqual([
      "Lodestone character already verified by someone else",
      "same Lodestone character already verified",
    ])
  })

  it("drops a name or world over 32 characters", () => {
    const r = run({ verification_records: [record({ character_name: "x".repeat(33) })] })
    expect(r.characters).toEqual([])
    expect(r.report.dropped).toHaveLength(1)
  })
})

describe("verification settings", () => {
  it("maps the two Lodestone flags, with proof winning", () => {
    expect(
      run({ verification_settings: [settings({ require_lodestone_verification: true, verified_role_id: "55" })] }).discordSettings[0]
    ).toMatchObject({ verification_lodestone: "exists" })
    expect(
      run({
        verification_settings: [
          settings({ require_lodestone_verification: true, require_lodestone_proof: true, require_captcha: true, verified_role_id: "55" }),
        ],
      }).discordSettings[0]
    ).toEqual({
      venue_key: "venue-a",
      verification_lodestone: "code",
      verification_captcha: true,
      verification_nickname: false,
      verified_role_id: "55",
    })
  })

  it("extends the server's existing settings row", () => {
    const r = run({ verification_settings: [settings({ require_captcha: true, verified_role_id: "55" })] }, [], [
      { venue_key: "venue-a", greeting_channel_id: "7" },
    ])
    expect(r.discordSettings).toEqual([
      {
        venue_key: "venue-a",
        greeting_channel_id: "7",
        verification_lodestone: "off",
        verification_captcha: true,
        verification_nickname: false,
        verified_role_id: "55",
      },
    ])
  })

  it("writes nothing for a server with no verified role, whose flags are Frogge's defaults, or that is not a venue", () => {
    const defaults = { require_captcha: true, require_lodestone_proof: true, change_name: true }
    const r = run({
      verification_settings: [settings(defaults), settings({ ...defaults, guild_id: "9", verified_role_id: "55" })],
    })
    expect(r.discordSettings).toEqual([])
    expect(r.report.counts["servers left at Frogge's defaults, which are not a choice"]).toBe(1)
  })

  it("turns name changing off when no Lodestone check is on", () => {
    const r = run({ verification_settings: [settings({ change_name: true, require_captcha: true, verified_role_id: "55" })] })
    expect(r.discordSettings[0]).toMatchObject({ verification_nickname: false })
    expect(r.report.dropped).toHaveLength(1)
  })
})
