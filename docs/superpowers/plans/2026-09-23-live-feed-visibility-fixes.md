# Live feed + stream visibility fixes (#66 review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address Allegro's three #66 findings:
1. The Live/Timeline feed history reads frozen Prisma data.
2. The SSE stream sends every sale's full details to every member.
3. An xvm-api outage shows 0 revenue rather than "—".

**Architecture:**
- **Individual sale items** follow the venue's `sales_visibility` (decision 2026-09-23). Enforcement is server-side in two places:
  - `timeline/route.ts` reads sales from xvm-api's transaction list, which applies `sales_visibility` itself.
  - `/api/stream` filters `sale` events per subscriber.
- **Revenue totals and the Transactions count** keep following `revenue_visibility`, as the Live page already does.
- The timeline's shift clock events move to xvm-api too, since they're the same frozen-data bug in the same file. Patron logs stay on Prisma, because the plugin still writes them there.

**Tech Stack:** Next.js App Router, TypeScript strict, vitest.

**Worktree:** `~/xvm-dashboard/.claude/worktrees/overview-staff-live`, branch `feat/overview-staff-live-xvm-reads` (PR #66), rebased onto `origin/dev` on 2026-09-23. Paths are relative to `apps/web/`. Run commands from `apps/web/`.

**Conventions:** no code comments at all (rationale goes in commit messages); match surrounding style; TS strict.

---

## Facts

- `VenueEvent` (`lib/sse/venue-events.ts`) types: `sale | patron_enter | patron_exit | room_status`. Only `sale` carries money or staff data. Sale events come from `lib/api/transactions.ts:171`, with `data.staff.id` = the **Prisma user id** of whoever logged it.
- A sale is always credited to whoever logs it: `createTransactionSchema` has no staff field, and xvm-api credits the caller's membership. So on the stream, "own" means `data.staff.id === viewer userId`, which matches xvm-api's `only_membership_id` clamp.
- `/api/stream/[venueId]` has three consumers: `components/live-dashboard.tsx`, `components/timeline-feed.tsx`, `components/rooms-board.tsx`. Only sale events are filtered, so the rooms board is unaffected.
- `SalesVisibility = "all" | "own" | "none"`; `getVenue(token, id).sales_visibility` (`lib/api/xvm-api.ts`).
- `xvmPageReader(userId, xvmApiVenueId)` (`lib/api/xvm-page-read.ts`) returns `read(label, fallback, (token, venueId) => call)`. It falls back on an unconnected venue, a missing token or any error.
- xvm-api `GET /finance/transactions?from&to` enforces `sales_visibility` for the caller: `none` returns 403 (so the reader's fallback `[]` applies), and `own` is clamped. Amounts are minor units, converted with `minorUnitsToDollars` (`lib/api/position-convert.ts`). Kinds: `sale | tip | cover_charge | other_income | expense | payout`. The old Prisma timeline only ever had revenue types, so `expense` and `payout` are excluded.
- `listShifts(token, venueId, {from, to})` returns shifts **overlapping** the window, with `actual_start` / `actual_end` / `membership_id`. `listMemberships` gives `{id, nickname, effective_tier, person: {display_name}}`. Both xvm-api list windows are capped at 60 days; use 59 for margin (Allegro's note on #65).
- `components/timeline-feed.tsx` only renders `staff.name` from a sale's staff object, but its `TimelineSaleStaff` type requires `id, name, displayName, image, characters, memberships`.

---

### Task 1: Per-subscriber sale filtering on the stream

**Files:**
- Create: `lib/sse/sale-visibility.ts`
- Test: `lib/sse/sale-visibility.test.ts`
- Modify: `app/api/stream/[venueId]/route.ts`

- [ ] **Step 1: Write the failing test** at `lib/sse/sale-visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { canReceiveEvent, type StreamViewer } from "./sale-visibility"
import type { VenueEvent } from "./venue-events"

const sale = (staffId: string | null): VenueEvent => ({
  id: "1",
  type: "sale",
  venueId: "v",
  timestamp: "2026-01-01T00:00:00Z",
  data: { amount: 10, staff: staffId === null ? null : { id: staffId, name: "A" } },
})
const patron: VenueEvent = { id: "2", type: "patron_enter", venueId: "v", timestamp: "2026-01-01T00:00:00Z", data: {} }
const viewer = (over: Partial<StreamViewer>): StreamViewer => ({ userId: "u1", isManager: false, salesVisibility: "all", ...over })

describe("canReceiveEvent", () => {
  it("passes non-sale events to everyone", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "none" }), patron)).toBe(true)
  })
  it("passes every sale to managers regardless of setting", () => {
    expect(canReceiveEvent(viewer({ isManager: true, salesVisibility: "none" }), sale("u2"))).toBe(true)
  })
  it("passes every sale to staff when sales are visible to all", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "all" }), sale("u2"))).toBe(true)
  })
  it("blocks every sale for staff when sales are hidden", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "none" }), sale("u1"))).toBe(false)
  })
  it("passes only the viewer's own sales under own", () => {
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale("u1"))).toBe(true)
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale("u2"))).toBe(false)
    expect(canReceiveEvent(viewer({ salesVisibility: "own" }), sale(null))).toBe(false)
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run lib/sse/sale-visibility.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `lib/sse/sale-visibility.ts`:

```ts
import type { SalesVisibility } from "@/lib/api/xvm-api"
import type { VenueEvent } from "@/lib/sse/venue-events"

export interface StreamViewer {
  userId: string
  isManager: boolean
  salesVisibility: SalesVisibility
}

export function canReceiveEvent(viewer: StreamViewer, event: VenueEvent): boolean {
  if (event.type !== "sale") return true
  if (viewer.isManager || viewer.salesVisibility === "all") return true
  if (viewer.salesVisibility === "none") return false
  const staff = event.data.staff as { id?: unknown } | null | undefined
  return staff?.id === viewer.userId
}
```

- [ ] **Step 4:** Run the test again. Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the stream route** `app/api/stream/[venueId]/route.ts`.

Add imports:

```ts
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getVenue, type SalesVisibility } from "@/lib/api/xvm-api"
import { canReceiveEvent, type StreamViewer } from "@/lib/sse/sale-visibility"
```

Directly after the existing `if (!membership) { return new Response("Forbidden", { status: 403 }) }` block, add:

```ts
  const isManager = membership.role === "OWNER" || membership.role === "MANAGER"
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  const readXvm = await xvmPageReader(session.user.id, venue?.xvmApiVenueId ?? null)
  const salesVisibility: SalesVisibility = isManager
    ? "all"
    : await readXvm<SalesVisibility>("stream sales visibility", "none", async (t, v) => (await getVenue(t, v)).sales_visibility)
  const viewer: StreamViewer = { userId: session.user.id, isManager, salesVisibility }
```

In the `venueEventBus.subscribe(venueId, (event: VenueEvent) => { ... })` callback, make the first statement:

```ts
        if (!canReceiveEvent(viewer, event)) return
```

Leave everything else in the route unchanged. (The `"none"` fallback fails closed for staff. Don't add that as a comment.)

- [ ] **Step 6:** Run `npx tsc --noEmit -p .` (exit 0) and `pnpm run test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add lib/sse/sale-visibility.ts lib/sse/sale-visibility.test.ts "app/api/stream/[venueId]/route.ts"
git commit -m "fix: live stream filters sale events per viewer" -m "The stream broadcast every sale's amount, customer, service and seller to every connected member, and the Live page only hid them in the browser. The route now resolves the viewer's sales visibility once at connect (managers see all; staff follow the venue's xvm-api sales_visibility, failing closed to none if it can't be read) and drops sale events the viewer isn't allowed to see before they're sent. Other event types are unaffected." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Timeline route reads sales and shifts from xvm-api

**Files:**
- Create: `lib/timeline-items.ts`
- Test: `lib/timeline-items.test.ts`
- Modify: `app/api/venues/[venueId]/timeline/route.ts`

- [ ] **Step 1: Write the failing test** at `lib/timeline-items.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { saleItems, shiftItems } from "./timeline-items"
import type { FinanceTransactionRow, MembershipRow, ShiftRow } from "@/lib/api/xvm-api"

const member = { id: 7, nickname: "Nick", effective_tier: "staff", person: { id: 1, display_name: "Disp", discord_id: null } } as unknown as MembershipRow
const members = new Map([[7, member]])

const tx = (over: Partial<FinanceTransactionRow>) =>
  ({
    id: 1,
    kind: "sale",
    amount: 12345,
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
  it("maps a revenue transaction into the timeline sale shape in display units", () => {
    const [item] = saleItems([tx({})], members)
    expect(item.id).toBe("sale_1")
    expect(item.type).toBe("sale")
    expect(item.timestamp.toISOString()).toBe("2026-01-01T10:00:00.000Z")
    expect(item.data.amount).toBe(123.45)
    expect(item.data.customerName).toBe("Cust")
    expect(item.data.service).toEqual({ id: "3", name: "Drink" })
    expect((item.data.staff as { name: string }).name).toBe("Nick")
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
```

- [ ] **Step 2:** Run `pnpm vitest run lib/timeline-items.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `lib/timeline-items.ts`:

```ts
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
```

- [ ] **Step 4:** Run the test again. Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite the sales and shift sections of** `app/api/venues/[venueId]/timeline/route.ts`.

Add imports:

```ts
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import {
  listFinanceTransactions,
  listMemberships,
  listShifts,
  type FinanceTransactionRow,
  type MembershipRow,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { saleItems, shiftItems, type TimelineApiItem } from "@/lib/timeline-items"
```

Add a module-level constant after the imports:

```ts
const TIMELINE_WINDOW_MS = 59 * 24 * 60 * 60 * 1000
```

- Change the `items` declaration to `const items: TimelineApiItem[] = []`.
- Delete the whole `// Fetch transactions` block (from `if (!type || type === "sales") {` through its closing `}`, including the `for (const t of transactions)` loop).
- Delete the whole `// Fetch shift events (clock-in / clock-out)` block (from `if (!type || type === "staff") {` through its closing `}`).
- Leave the patron-log block exactly as it is.

Directly before the patron-log block, insert:

```ts
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  const readXvm = await xvmPageReader(session.user.id, venue?.xvmApiVenueId ?? null)
  const windowTo = cursor ? new Date(cursor) : new Date()
  let windowFrom = new Date(windowTo.getTime() - TIMELINE_WINDOW_MS)
  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, venueId }, select: { startTime: true } })
    if (event && event.startTime > windowFrom) windowFrom = event.startTime
  }
  const range = { from: windowFrom.toISOString(), to: windowTo.toISOString() }
  const wantSales = !type || type === "sales"
  const wantShifts = !type || type === "staff"

  if (windowFrom < windowTo && (wantSales || wantShifts)) {
    const [roster, transactions, shifts] = await Promise.all([
      readXvm("timeline roster", [] as MembershipRow[], (t, v) => listMemberships(t, v)),
      wantSales
        ? readXvm("timeline sales", [] as FinanceTransactionRow[], (t, v) => listFinanceTransactions(t, v, range))
        : Promise.resolve([] as FinanceTransactionRow[]),
      wantShifts
        ? readXvm("timeline shifts", [] as ShiftRow[], (t, v) => listShifts(t, v, range))
        : Promise.resolve([] as ShiftRow[]),
    ])
    const members = new Map(roster.map((m) => [m.id, m]))
    items.push(...saleItems(transactions, members), ...shiftItems(shifts, members))
  }
```

Then replace the existing sort/trim lines:

```ts
  // Sort merged results by timestamp desc
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  // Trim to limit
  const trimmed = items.slice(0, limit)
```

with:

```ts
  const trimmed = items
    .filter((i) => !cursor || i.timestamp < windowTo)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
```

Leave the `nextCursor` / response lines unchanged. If `resolveDisplayName` is now unused in the route, remove its import.

- [ ] **Step 6:** Verify: `grep -nE "prisma\.(transaction|shift)\." "app/api/venues/[venueId]/timeline/route.ts"` prints nothing; `npx tsc --noEmit -p .` exits 0; `pnpm run test` passes; `npx eslint "app/api/venues/[venueId]/timeline/route.ts" lib/timeline-items.ts` has 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/timeline-items.ts lib/timeline-items.test.ts "app/api/venues/[venueId]/timeline/route.ts"
git commit -m "fix: timeline reads sales and shift clock events from xvm-api" -m "The timeline's sale and clock-in/out items came from Prisma transaction and shift tables that no longer receive writes, so the Live feed's history and the Timeline page showed nothing new. They now come from xvm-api's transaction and shift lists (59-day window, or from the event's start when eventId is given). xvm-api applies the venue's sales_visibility to the transaction list, which also closes the Timeline page showing every sale to every member. Patron logs stay on Prisma, where the plugin still writes them. Expense and payout rows are excluded, matching the old revenue-only feed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Live page shows "—" on a failed summary; sale items trust the server

**Files:**
- Modify: `app/dashboard/[slug]/live/page.tsx`
- Modify: `components/live-dashboard.tsx`

- [ ] **Step 1: Page.** In `app/dashboard/[slug]/live/page.tsx`, directly after the `const saleCountDisplay = ...` line (around line 103), add:

```ts
  const revenueUnavailable = showRevenue && eventStart !== undefined && eventStart <= now && eventSummary === null
```

Then add the prop `revenueUnavailable={revenueUnavailable}` to the `<LiveDashboard ... />` element, next to `initialSaleCount`.

- [ ] **Step 2: Dashboard props.** In `components/live-dashboard.tsx`:
- Add `revenueUnavailable: boolean` to `LiveDashboardProps`, after `initialSaleCount: number`.
- Add `revenueUnavailable,` to the destructured parameters, after `initialSaleCount,`.

- [ ] **Step 3: Timeline load.** In the "Load historical activity" effect's `.filter(...)`, replace:

```ts
                (item.type === "sale" &&
                  showRevenue &&
                  (!scopeSalesToOwn || item.data.staff?.id === currentUserId)) ||
                item.type === "patron_enter" ||
```

with:

```ts
                item.type === "sale" ||
                item.type === "patron_enter" ||
```

and change that effect's dependency array from `[venueId, event.id, isUpcoming, showRevenue, scopeSalesToOwn, currentUserId]` to `[venueId, event.id, isUpcoming]`.

- [ ] **Step 4: SSE sale handler.** Replace:

```ts
        if (data.type === "sale" && showRevenue && (!scopeSalesToOwn || data.data.staff?.id === currentUserId)) {
          const amt = Number(data.data.amount || 0)
          setRevenue((prev) => prev + amt)
          setSaleCount((prev) => prev + 1)
```

with:

```ts
        if (data.type === "sale") {
          const amt = Number(data.data.amount || 0)
          if (showRevenue && !revenueUnavailable && (!scopeSalesToOwn || data.data.staff?.id === currentUserId)) {
            setRevenue((prev) => prev + amt)
            setSaleCount((prev) => prev + 1)
          }
```

Leave the `setActivity(...)` call that follows, and the block's closing brace, unchanged. Add `revenueUnavailable` to that SSE effect's dependency array (currently `[venueId, showRevenue, scopeSalesToOwn, currentUserId]`).

- [ ] **Step 5: Cards.** In the revenue `StatReadout`, change `value={`${revenue.toLocaleString()}`}` to `value={revenueUnavailable ? "—" : `${revenue.toLocaleString()}`}` and `subtext="gil"` to `subtext={revenueUnavailable ? "unavailable" : "gil"}`. In the Transactions `StatReadout`, change `value={saleCount}` to `value={revenueUnavailable ? "—" : saleCount}`.

- [ ] **Step 6:** Verify: `npx tsc --noEmit -p .` exits 0, `pnpm run test` passes, and `npx eslint components/live-dashboard.tsx "app/dashboard/[slug]/live/page.tsx"` has 0 errors and no new warnings versus `git show HEAD:<path> | npx eslint --stdin --stdin-filename <path>`.

- [ ] **Step 7: Commit**

```bash
git add "app/dashboard/[slug]/live/page.tsx" components/live-dashboard.tsx
git commit -m "fix: live page shows unavailable revenue instead of zero" -m "A failed finance summary fell back to 0, which reads as a quiet night rather than an outage. The page now flags it, the revenue and Transactions cards show a dash, and live increments stop until a refresh can load a real total. Sale items in the feed no longer get a browser-side filter: the stream and timeline now enforce sales visibility on the server, and revenue totals still follow revenue visibility." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Controller wrap-up (not a subagent)

- Full `tsc` / `vitest` / lint run.
- Force-push the rebased branch (`--force-with-lease`).
- Correct the #66 description's privacy claim.
- Reply to Allegro's three threads.
- Live check checklist for the human (needs Discord OAuth):
  - Staff on `sales_visibility: none` see no sale items on Live or Timeline, and none arrive live.
  - Staff on `own` see only their own.
  - Managers see all.
  - Stopping xvm-api shows "—" on the Live revenue card.
