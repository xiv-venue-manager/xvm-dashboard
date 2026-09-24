import type { FinanceTransactionRow, MembershipRow, ShiftRow } from "@/lib/api/xvm-api"
import { minorUnitsToDollars } from "@/lib/api/position-convert"
import { resolveDisplayName } from "@/lib/display-name"

export type TimelineApiItem = {
  id: string
  type: "sale" | "patron_enter" | "patron_exit" | "shift_start" | "shift_end"
  timestamp: Date
  data: Record<string, unknown>
}

const REVENUE_KINDS: ReadonlySet<string> = new Set(["sale", "tip", "cover_charge", "other_income"])

function memberName(member: MembershipRow | undefined): string {
  const name = resolveDisplayName({ nickname: member?.nickname, displayName: member?.person.display_name })
  return name === "Unknown" ? "Staff" : name
}

export function saleItems(rows: FinanceTransactionRow[], members: Map<number, MembershipRow>): TimelineApiItem[] {
  return rows
    .filter((t) => REVENUE_KINDS.has(t.kind))
    .map((t) => {
      const member = t.membership_id !== null ? members.get(t.membership_id) : undefined
      return {
        id: `sale_${t.id}`,
        type: "sale" as const,
        timestamp: new Date(t.created_at),
        data: {
          amount: minorUnitsToDollars(t.amount) ?? 0,
          customerName: t.customer_name,
          notes: t.notes,
          service: t.service_id !== null ? { id: String(t.service_id), name: t.service_name ?? "" } : null,
          event: null,
          staff: member
            ? { id: String(member.id), name: memberName(member), displayName: null, image: null, characters: [], memberships: [] }
            : null,
        },
      }
    })
}

export function shiftItems(rows: ShiftRow[], members: Map<number, MembershipRow>): TimelineApiItem[] {
  return rows.flatMap((s) => {
    if (!s.actual_start) return []
    const member = s.membership_id !== null ? members.get(s.membership_id) : undefined
    const data = {
      staffName: memberName(member),
      roleName: member ? member.effective_tier.toUpperCase() : "STAFF",
      shiftId: String(s.id),
    }
    const items: TimelineApiItem[] = [{ id: `shift_start_${s.id}`, type: "shift_start", timestamp: new Date(s.actual_start), data }]
    if (s.actual_end) {
      items.push({ id: `shift_end_${s.id}`, type: "shift_end", timestamp: new Date(s.actual_end), data })
    }
    return items
  })
}
