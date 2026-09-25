import { describe, it, expect } from "vitest"
import { saleItems, shiftItems } from "./timeline-items"
import type { FinanceTransactionRow, MembershipRow, ShiftRow } from "@/lib/api/xvm-api"

const member = { id: 7, nickname: "Nick", effective_tier: "staff", person: { id: 1, display_name: "Disp", discord_id: null } } as unknown as MembershipRow
const members = new Map([[7, member]])

const tx = (over: Partial<FinanceTransactionRow>) =>
  ({
    id: 1,
    kind: "sale",
    amount: 4500,
    service_id: 3,
    service_name: "Drink",
    membership_id: 7,
    customer_name: "Cust",
    notes: null,
    created_at: "2026-01-01T10:00:00Z",
    ...over,
  }) as unknown as FinanceTransactionRow

const shift = (over: Partial<ShiftRow>) =>
  ({ id: 9, membership_id: 7, actual_start: "2026-01-01T09:00:00Z", actual_end: null, ...over }) as unknown as ShiftRow

describe("saleItems", () => {
  it("maps a revenue transaction into the timeline sale shape as whole gil", () => {
    const [item] = saleItems([tx({})], members)
    expect(item.id).toBe("sale_1")
    expect(item.type).toBe("sale")
    expect(item.timestamp.toISOString()).toBe("2026-01-01T10:00:00.000Z")
    expect(item.data.amount).toBe(4500)
    expect(item.data.customerName).toBe("Cust")
    expect(item.data.service).toEqual({ id: "3", name: "Drink" })
    expect((item.data.staff as { name: string }).name).toBe("Nick")
  })
  it("identifies the seller by membership id, not a user id", () => {
    const staff = saleItems([tx({ kind: "sale", membership_id: 7 })], members)[0].data.staff as Record<string, unknown>
    expect(staff.membershipId).toBe("7")
    expect(staff).not.toHaveProperty("id")
  })
  it("drops expense and payout rows", () => {
    expect(saleItems([tx({ kind: "expense" }), tx({ kind: "payout" }), tx({ kind: "tip" })], members)).toHaveLength(1)
  })
  it("leaves staff and service null when absent", () => {
    const [item] = saleItems([tx({ membership_id: null, service_id: null })], members)
    expect(item.data.staff).toBeNull()
    expect(item.data.service).toBeNull()
  })
})

describe("shiftItems", () => {
  it("emits a start item, and an end item once clocked out", () => {
    expect(shiftItems([shift({})], members).map((i) => i.id)).toEqual(["shift_start_9"])
    const both = shiftItems([shift({ actual_end: "2026-01-01T12:00:00Z" })], members)
    expect(both.map((i) => i.type)).toEqual(["shift_start", "shift_end"])
    expect(both[0].data).toEqual({ staffName: "Nick", roleName: "STAFF", shiftId: "9" })
  })
  it("skips shifts that never started", () => {
    expect(shiftItems([shift({ actual_start: null })], members)).toEqual([])
  })
})
