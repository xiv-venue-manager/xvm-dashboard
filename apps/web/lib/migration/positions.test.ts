import { describe, it, expect } from "vitest"
import { mapPositions, type ExportedMembership, type ExportedRole } from "./positions"

const role = (over: Partial<ExportedRole> = {}): ExportedRole => ({
  id: "r1",
  venueId: "v1",
  name: "Bartender",
  color: "#6366f1",
  responsibilities: null,
  hourlyRate: null,
  hasPermissions: false,
  potPayoutMode: "STANDARD",
  contractorSharesPot: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const member = (over: Partial<ExportedMembership> = {}): ExportedMembership => ({
  id: "m1",
  userId: "u1",
  venueId: "v1",
  role: "STAFF",
  roleId: null,
  hireDate: "2026-01-05T00:00:00.000Z",
  status: "active",
  nickname: null,
  hourlyRate: null,
  tipPooled: null,
  temporaryRole: null,
  createdAt: "2026-01-05T00:00:00.000Z",
  additionalRoleIds: [],
  ...over,
})

const people = new Set(["u1", "u2"])
const run = (roles: ExportedRole[], memberships: ExportedMembership[] = [], keys: ReadonlySet<string> = people) =>
  mapPositions({ roles, memberships }, keys)

describe("positions", () => {
  it("maps a role to a position", () => {
    expect(run([role({ hourlyRate: 1500, potPayoutMode: "POT", contractorSharesPot: true })]).positions).toEqual([
      {
        key: "r1", venue_key: "v1", name: "Bartender", color: 0x6366f1, responsibilities: null,
        hourly_rate_minor: 1500, pot_payout_mode: "pot", contractor_shares_pot: true,
      },
    ])
  })

  it("gives a null colour a null colour, and a malformed one a warning", () => {
    const r = run([role({ id: "a", color: null }), role({ id: "b", name: "Host", color: "blue" })])
    expect(r.positions.map((p) => p.color)).toEqual([null, null])
    expect(r.warnings.map((w) => w.key)).toEqual(["b"])
  })

  it("rounds a fractional hourly rate to a whole gil and says so", () => {
    const r = run([role({ hourlyRate: 1500.5 })])
    expect(r.positions[0].hourly_rate_minor).toBe(1501)
    expect(r.warnings[0].message).toContain("rounded")
  })

  it("warns when permissions are dropped", () => {
    expect(run([role({ hasPermissions: true })]).warnings[0].message).toContain("permissions dropped")
  })

  it("cuts responsibilities over 500 characters and warns", () => {
    const r = run([role({ responsibilities: "x".repeat(600) })])
    expect(r.positions[0].responsibilities).toHaveLength(500)
    expect(r.warnings).toHaveLength(1)
  })

  it("skips a blank name and a name over 100 characters", () => {
    const r = run([role({ id: "a", name: " " }), role({ id: "b", name: "x".repeat(101) })])
    expect(r.positions).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b"])
  })

  it("keeps the earlier of two roles that differ only by case at one venue", () => {
    const r = run([
      role({ id: "late", name: "bartender", createdAt: "2026-02-01T00:00:00.000Z" }),
      role({ id: "early" }),
      role({ id: "other", venueId: "v2", name: "BARTENDER" }),
    ])
    expect(r.positions.map((p) => p.key)).toEqual(["early", "other"])
    expect(r.skipped).toEqual([{ key: "late", reason: "same name as an earlier role at this venue, ignoring case" }])
  })
})

describe("memberships", () => {
  it("maps an active membership with one open employment period at the hire date", () => {
    const r = run([], [member({ role: "MANAGER", nickname: " Ash ", tipPooled: true })])
    expect(r.memberships).toEqual([
      {
        key: "m1", venue_key: "v1", person_key: "u1", tier: "manager", nickname: "Ash", tip_pooled: true,
        created_at: "2026-01-05T00:00:00.000Z",
        employment_period: { started_at: "2026-01-05T00:00:00.000Z", ended_at: null },
      },
    ])
  })

  it("drops pending invites and flags any other status for a decision", () => {
    const r = run([], [
      member({ id: "p", status: "pending", userId: null }),
      member({ id: "i", status: "inactive", userId: "u2" }),
    ])
    expect(r.memberships).toEqual([])
    expect(r.skipped).toEqual([
      { key: "i", reason: "status inactive, needs a decision" },
      { key: "p", reason: "pending invite" },
    ])
  })

  it("skips a membership whose person is not loaded", () => {
    const r = run([], [member({ userId: "ghost" })])
    expect(r.skipped).toEqual([{ key: "m1", reason: "person not loaded" }])
  })

  it("keeps the earlier of two memberships for one person at one venue", () => {
    const r = run([], [
      member({ id: "late", createdAt: "2026-03-01T00:00:00.000Z" }),
      member({ id: "early" }),
    ])
    expect(r.memberships.map((m) => m.key)).toEqual(["early"])
    expect(r.skipped[0].key).toBe("late")
  })

  it("lets one person hold memberships at different venues", () => {
    expect(run([], [member({ id: "a" }), member({ id: "b", venueId: "v2" })]).memberships).toHaveLength(2)
  })

  it("warns about a dropped hourly rate and an unmigrated temporary role", () => {
    const r = run([], [member({ hourlyRate: 500, temporaryRole: "MANAGER" })])
    expect(r.warnings.map((w) => w.message)).toEqual([
      "temporary role MANAGER not migrated",
      "membership hourly rate 500 dropped, xvm-api has no home for it",
    ])
  })

  it("assigns the custom role and the additional roles, once each", () => {
    const r = run(
      [role({ id: "r1" }), role({ id: "r2", name: "Host" }), role({ id: "r3", name: "DJ" })],
      [member({ roleId: "r1", additionalRoleIds: ["r2", "r1", "r3"] })]
    )
    expect(r.membershipPositions).toEqual([
      { membership_key: "m1", position_key: "r1" },
      { membership_key: "m1", position_key: "r2" },
      { membership_key: "m1", position_key: "r3" },
    ])
  })

  it("does not assign a position that was skipped or belongs to another venue", () => {
    const r = run(
      [role({ id: "r1" }), role({ id: "dup", name: "BARTENDER", createdAt: "2026-02-01T00:00:00.000Z" }), role({ id: "far", venueId: "v2", name: "Elsewhere" })],
      [member({ roleId: "dup", additionalRoleIds: ["far", "gone"] })]
    )
    expect(r.membershipPositions).toEqual([])
    expect(r.skipped.filter((s) => s.key.startsWith("m1:")).map((s) => s.reason)).toEqual([
      "position was not loaded",
      "position belongs to another venue",
      "position was not loaded",
    ])
  })
})
