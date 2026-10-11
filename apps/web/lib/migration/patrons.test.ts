import { describe, it, expect } from "vitest"
import { mapPatrons, type ExportedPatron, type ExportedPatronLog, type PatronsContext } from "./patrons"

const patron = (over: Partial<ExportedPatron> = {}): ExportedPatron => ({
  id: "p1",
  venueId: "v1",
  characterName: "Ash Vale",
  world: "Twintania",
  isBanned: false,
  banReason: null,
  bannedAt: null,
  bannedById: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const log = (over: Partial<ExportedPatronLog> = {}): ExportedPatronLog => ({
  id: "l1",
  venueId: "v1",
  eventId: null,
  characterName: "Ash Vale",
  world: "Twintania",
  action: "ENTER",
  countChange: 1,
  loggedBy: "u1",
  timestamp: "2026-01-05T20:00:00.000Z",
  loggedAt: "2026-01-05T20:00:01.000Z",
  wasWorking: false,
  workingUserId: null,
  reclassifiedAt: null,
  reclassifiedById: null,
  reclassifyReason: null,
  ...over,
})

const ctx = (over: Partial<PatronsContext> = {}): PatronsContext => ({
  personKeys: new Set(["u1", "u2"]),
  eventKeys: new Set(["e1"]),
  ...over,
})

const run = (patrons: ExportedPatron[], logs: ExportedPatronLog[] = [], c: PatronsContext = ctx()) => mapPatrons({ patrons, logs }, c)

describe("patrons", () => {
  it("maps an unbanned patron with no ban data", () => {
    expect(run([patron()]).patrons[0]).toEqual({
      key: "p1", venue_key: "v1", character_name: "Ash Vale", world: "Twintania",
      ban_reason: null, banned_at: null, banned_by_person_key: null, created_at: "2026-01-01T00:00:00.000Z",
    })
  })

  it("maps a banned patron with the reason, date and banning person", () => {
    const r = run([patron({ isBanned: true, banReason: "Harassment", bannedAt: "2026-02-01T00:00:00.000Z", bannedById: "u2" })])
    expect(r.patrons[0]).toMatchObject({ ban_reason: "Harassment", banned_at: "2026-02-01T00:00:00.000Z", banned_by_person_key: "u2" })
  })

  it("clears ban data on a patron who is not banned, and counts it", () => {
    const r = run([patron({ isBanned: false, banReason: "old", bannedAt: "2026-02-01T00:00:00.000Z", bannedById: "u2" })])
    expect(r.patrons[0]).toMatchObject({ ban_reason: null, banned_at: null, banned_by_person_key: null })
    expect(r.warnings).toEqual([{ key: "patrons", message: "1 unbanned patrons still had ban data, cleared because xvm-api reads any ban date as banned" }])
  })

  it("dates a ban with no date by the patron's creation, with a warning", () => {
    const r = run([patron({ isBanned: true })])
    expect(r.patrons[0].banned_at).toBe("2026-01-01T00:00:00.000Z")
    expect(r.warnings).toHaveLength(1)
  })

  it("leaves the banning person empty when they were not loaded", () => {
    expect(run([patron({ isBanned: true, bannedAt: "2026-02-01T00:00:00.000Z", bannedById: "ghost" })]).patrons[0].banned_by_person_key).toBeNull()
  })

  it("keeps the earlier of two patrons that differ only by case at one venue", () => {
    const r = run([
      patron({ id: "late", characterName: "ash vale", world: "TWINTANIA", createdAt: "2026-03-01T00:00:00.000Z" }),
      patron({ id: "early" }),
      patron({ id: "other", venueId: "v2" }),
    ])
    expect(r.patrons.map((p) => p.key)).toEqual(["early", "other"])
    expect(r.skipped).toEqual([{ key: "late", reason: "same character and world as an earlier patron at this venue, ignoring case" }])
  })

  it("skips a blank or over-long name", () => {
    const r = run([patron({ id: "a", characterName: " " }), patron({ id: "b", characterName: "x".repeat(33) })])
    expect(r.patrons).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b"])
  })
})

describe("patron logs", () => {
  it("maps an entry and an exit, renaming the action", () => {
    const r = run([], [log(), log({ id: "l2", action: "LEAVE", countChange: -1, timestamp: "2026-01-05T22:00:00.000Z" }), log({ id: "l3", action: "EXIT", countChange: -1, timestamp: "2026-01-05T23:00:00.000Z" })])
    expect(r.logs.map((l) => [l.action, l.count_change])).toEqual([["enter", 1], ["leave", -1], ["leave", -1]])
  })

  it("gives a named entry or exit with a count of 0 the count it should have had, and counts them", () => {
    const r = run([], [log({ id: "a", countChange: 0 }), log({ id: "b", action: "LEAVE", countChange: 0, timestamp: "2026-01-05T21:00:00.000Z" })])
    expect(r.logs.map((l) => l.count_change)).toEqual([1, -1])
    expect(r.warnings).toEqual([{ key: "logs", message: "2 logs had a count of 0, set to +1 for an entry or -1 for an exit so occupancy counts them" }])
  })

  it("drops a log with no character and a count of 0", () => {
    const r = run([], [log({ characterName: null, countChange: 0 }), log({ id: "b", characterName: "  ", countChange: 0 })])
    expect(r.logs).toEqual([])
    expect(r.skipped).toHaveLength(2)
  })

  it("keeps a nameless log that still counts", () => {
    const r = run([], [log({ characterName: null, world: null, countChange: 1 })])
    expect(r.logs[0]).toMatchObject({ character_name: null, count_change: 1 })
  })

  it("keeps a character-level present log with no count", () => {
    const r = run([], [log({ action: "PRESENT", countChange: null })])
    expect(r.logs[0]).toMatchObject({ action: "present", count_change: null })
  })

  it("skips an unknown action and a log with neither a character nor a count", () => {
    const r = run([], [log({ id: "a", action: "TELEPORT" }), log({ id: "b", characterName: null, countChange: null })])
    expect(r.logs).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b"])
  })

  it("carries who logged it, whether they were working, and the event link", () => {
    const r = run([], [log({ eventId: "e1", wasWorking: true, workingUserId: "u2" })])
    expect(r.logs[0]).toMatchObject({ event_key: "e1", logged_by_person_key: "u1", was_working: true, working_person_key: "u2" })
  })

  it("leaves unloaded people and events empty, and counts the events", () => {
    const r = run([], [log({ loggedBy: "ghost", eventId: "gone", workingUserId: "ghost" })])
    expect(r.logs[0]).toMatchObject({ logged_by_person_key: null, event_key: null, working_person_key: null })
    expect(r.warnings).toEqual([{ key: "logs", message: "1 logs pointed at an event that was not loaded, left without an event" }])
  })

  it("keeps a reclassification that has both a time and a loaded person", () => {
    const r = run([], [log({ reclassifiedAt: "2026-01-06T00:00:00.000Z", reclassifiedById: "u2", reclassifyReason: " was staff " })])
    expect(r.logs[0]).toMatchObject({ reclassified_at: "2026-01-06T00:00:00.000Z", reclassified_by_person_key: "u2", reclassify_reason: "was staff" })
  })

  it("drops a reclassification missing its person, because xvm-api needs both", () => {
    const r = run([], [log({ reclassifiedAt: "2026-01-06T00:00:00.000Z", reclassifiedById: "ghost", reclassifyReason: "x" })])
    expect(r.logs[0]).toMatchObject({ reclassified_at: null, reclassified_by_person_key: null, reclassify_reason: null })
    expect(r.warnings[0].message).toContain("reclassifications dropped")
  })
})
