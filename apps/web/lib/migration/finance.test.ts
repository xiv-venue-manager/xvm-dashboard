import { describe, it, expect } from "vitest"
import { mapFinance, payeeKey, type ExportedPayroll, type ExportedTransaction, type FinanceContext } from "./finance"

const tx = (over: Partial<ExportedTransaction> = {}): ExportedTransaction => ({
  id: "t1",
  venueId: "v1",
  eventId: null,
  serviceId: null,
  serviceName: null,
  staffId: "u1",
  type: "SALE",
  amount: 5000,
  customerName: null,
  notes: null,
  createdAt: "2026-01-05T20:00:00.000Z",
  ...over,
})

const pay = (over: Partial<ExportedPayroll> = {}): ExportedPayroll => ({
  id: "p1",
  venueId: "v1",
  membershipId: "m1",
  isManualEntry: false,
  manualEntryName: null,
  paymentType: "FIXED_SALARY",
  baseRate: 100000,
  hoursWorked: null,
  bonusAmount: null,
  totalAmount: 100000,
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-08T00:00:00.000Z",
  isPaid: true,
  paidAt: "2026-01-09T00:00:00.000Z",
  paidBy: "u2",
  notes: null,
  potDistributionId: null,
  createdAt: "2026-01-08T00:00:00.000Z",
  updatedAt: "2026-01-09T00:00:00.000Z",
  ...over,
})

const ctx = (over: Partial<FinanceContext> = {}): FinanceContext => ({
  personKeys: new Set(["u1", "u2"]),
  memberships: new Map([["m1", { venue: "v1", person: "u1" }]]),
  eventKeys: new Set(["e1"]),
  serviceKeys: new Set(["s1"]),
  ...over,
})

const run = (transactions: ExportedTransaction[], payroll: ExportedPayroll[] = [], c: FinanceContext = ctx()) =>
  mapFinance({ transactions, payroll }, c)

describe("transactions", () => {
  it("maps a sale as posted, dated by its creation, with the staff member's membership", () => {
    expect(run([tx({ serviceId: "s1", serviceName: " House  Cocktail " })]).transactions[0]).toEqual({
      key: "t1", venue_key: "v1", event_key: null, service_key: "s1", service_name: "House Cocktail",
      membership_key: "m1", recorded_by_person_key: "u1", kind: "sale", amount: 5000, customer_name: null, notes: null,
      status: "posted", created_at: "2026-01-05T20:00:00.000Z", posted_at: "2026-01-05T20:00:00.000Z",
    })
  })

  it("maps each transaction type", () => {
    const r = run([tx({ id: "a", type: "TIP" }), tx({ id: "b", type: "COVER_CHARGE" }), tx({ id: "c", type: "OTHER" })])
    expect(r.transactions.map((t) => t.kind)).toEqual(["tip", "cover_charge", "other_income"])
  })

  it("keeps the service name when the service itself was not loaded", () => {
    const r = run([tx({ serviceId: "gone", serviceName: "Old Item" })])
    expect(r.transactions[0]).toMatchObject({ service_key: null, service_name: "Old Item" })
  })

  it("leaves the membership empty when the staff member has none at that venue", () => {
    const r = run([tx({ staffId: "u2" })])
    expect(r.transactions[0]).toMatchObject({ membership_key: null, recorded_by_person_key: "u2" })
  })

  it("leaves the staff member and event empty, with a warning each, when not loaded", () => {
    const r = run([tx({ staffId: "ghost", eventId: "gone" })])
    expect(r.transactions[0]).toMatchObject({ recorded_by_person_key: null, membership_key: null, event_key: null })
    expect(r.warnings).toHaveLength(2)
  })

  it("skips an amount that is not positive, and rounds a fractional one", () => {
    const r = run([tx({ id: "a", amount: 0 }), tx({ id: "b", amount: 12.5 })])
    expect(r.skipped).toEqual([{ key: "a", reason: "amount is not positive" }])
    expect(r.transactions[0].amount).toBe(13)
  })

  it("cuts a customer name over 32 characters and notes over 200", () => {
    const r = run([tx({ customerName: "c".repeat(40), notes: "n".repeat(250) })])
    expect(r.transactions[0].customer_name).toHaveLength(32)
    expect(r.transactions[0].notes).toHaveLength(200)
    expect(r.warnings).toHaveLength(2)
  })
})

describe("payroll", () => {
  it("maps a fixed salary to the membership's person", () => {
    expect(run([], [pay()]).payroll[0]).toEqual({
      key: "p1", venue_key: "v1", membership_key: "m1", person_key: "u1", payment_type: "fixed_salary",
      base_rate_minor: 100000, minutes_worked: null, bonus_amount_minor: null, total_amount_minor: 100000,
      period_start: "2026-01-01T00:00:00.000Z", period_end: "2026-01-08T00:00:00.000Z",
      paid_by_person_key: "u2", paid_at: "2026-01-09T00:00:00.000Z", notes: null,
      created_at: "2026-01-08T00:00:00.000Z", updated_at: "2026-01-09T00:00:00.000Z",
    })
  })

  it("turns hourly hours into whole minutes and keeps the stored total", () => {
    const r = run([], [pay({ paymentType: "HOURLY", baseRate: 1500, hoursWorked: 2.33, totalAmount: 3495 })])
    expect(r.payroll[0]).toMatchObject({ payment_type: "hourly", minutes_worked: 140, total_amount_minor: 3495 })
    expect(r.warnings).toEqual([{ key: "payroll", message: "1 hourly entries had hours rounded to whole minutes, the stored total is kept unchanged" }])
  })

  it("does not count a clean number of minutes as rounded", () => {
    const r = run([], [pay({ paymentType: "HOURLY", hoursWorked: 2.5 })])
    expect(r.payroll[0].minutes_worked).toBe(150)
    expect(r.warnings).toEqual([])
  })

  it("rounds a fractional gil amount and counts it", () => {
    const r = run([], [pay({ baseRate: 1500.5, totalAmount: 1500.5, bonusAmount: 10 })])
    expect(r.payroll[0]).toMatchObject({ base_rate_minor: 1501, total_amount_minor: 1501, bonus_amount_minor: 10 })
    expect(r.warnings[0].message).toContain("fractional gil")
  })

  it("moves a period end that is not after the start to a day later, and counts it", () => {
    const r = run([], [pay({ periodEnd: "2026-01-01T00:00:00.000Z" })])
    expect(r.payroll[0].period_end).toBe("2026-01-02T00:00:00.000Z")
    expect(r.warnings[0].message).toContain("start plus one day")
  })

  it("makes a manual entry belong to its payee placeholder", () => {
    const r = run([], [pay({ membershipId: null, isManualEntry: true, manualEntryName: "  DJ  Kestrel " })])
    expect(r.payroll[0]).toMatchObject({ membership_key: null, person_key: "payee:dj kestrel" })
    expect(payeeKey("DJ Kestrel")).toBe("payee:dj kestrel")
  })

  it("drops a paid hourly entry with a total of 0", () => {
    const r = run([], [pay({ paymentType: "HOURLY", totalAmount: 0, hoursWorked: 0 })])
    expect(r.payroll).toEqual([])
    expect(r.skipped).toEqual([{ key: "p1", reason: "paid hourly entry with a total of 0" }])
  })

  it("keeps an unpaid hourly entry with no pay yet, and leaves it unpaid", () => {
    const r = run([], [pay({ paymentType: "HOURLY", isPaid: false, paidAt: null, paidBy: null, totalAmount: 0, hoursWorked: 4 })])
    expect(r.payroll[0]).toMatchObject({ paid_at: null, paid_by_person_key: null })
  })

  it("dates a paid entry by its last update when paidAt is missing", () => {
    expect(run([], [pay({ paidAt: null })]).payroll[0].paid_at).toBe("2026-01-09T00:00:00.000Z")
  })

  it("skips an entry whose membership was not loaded or is at another venue, or has no payee at all", () => {
    const r = run([], [
      pay({ id: "a", membershipId: "gone" }),
      pay({ id: "b", venueId: "v2" }),
      pay({ id: "c", membershipId: null, isManualEntry: false }),
    ])
    expect(r.payroll).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(["membership was not loaded", "membership was not loaded", "no membership and no payee name"])
  })

  it("warns when a pot distribution link is dropped", () => {
    expect(run([], [pay({ potDistributionId: "d1" })]).warnings[0].message).toContain("pot distribution")
  })
})
