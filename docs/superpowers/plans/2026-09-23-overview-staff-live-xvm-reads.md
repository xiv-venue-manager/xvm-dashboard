# Overview / Staff / Live pages: read from xvm-api instead of frozen Prisma tables

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the shift, transaction, task and revenue-visibility reads on the venue Overview, Staff and Live pages from Prisma to xvm-api, so they stop showing data frozen at the cutover.

**Architecture:** Since the Shifts, Transactions and Tasks cutovers, nothing on the dashboard writes Prisma `transaction` or `task` rows. Prisma `shift` rows only come from the roll-forward cron and the Discord shift-bot. For connected venues, visibility settings (`revenueVisibility` etc.) are written only to xvm-api (`app/api/venues/[venueId]/settings/route.ts` ~line 270). These three pages still read all of that from Prisma. This plan adds two xvm-api client wrappers (`getFinanceSummary`, `listShiftsOnNow`), one shared server-side read helper (`xvmPageReader`), and swaps the reads page by page. Events, patron logs, announcements, follows and character-link reads stay on Prisma; those domains are not cut over.

**Tech Stack:** Next.js App Router server components, TypeScript strict, vitest, xvm-api (FastAPI) via `lib/api/xvm-api.ts`.

**Worktree:** `~/xvm-dashboard/.claude/worktrees/overview-staff-live`, branch `feat/overview-staff-live-xvm-reads`, based on `origin/dev`. All paths below are relative to `apps/web/` unless they start with `docs/`. Run commands from `apps/web/`.

**Repo conventions (CLAUDE.md + owner preferences):** no code comments at all, not even "why" comments; rationale goes in commit messages. Match surrounding style. Keep TS strict.

---

## Facts the tasks rely on (verified 2026-09-23 against xvm-api `origin/dev`)

- `GET /venues/{id}/finance/transactions/summary?from&to` returns `FinanceSummary {window_from, window_to, total_revenue, total_expense, total_payout, net, transaction_count, category_totals: {category_id, total}[]}`. It counts **posted, unvoided** rows only. Dashboard- and plugin-created sales default to `posted`, so the totals match live SSE sale events.
- The summary follows the venue's `revenue_visibility` on the xvm-api side. Managers see everything. `all` shows staff everything; `own` clamps to the caller's own membership; `hide` returns **403** for non-managers.
- `GET /finance/transactions` follows `sales_visibility`, and `none` returns 403 for non-managers. Amounts everywhere are **minor units**; the dashboard shows `minorUnitsToDollars(x)` (`lib/api/position-convert.ts`), same as `app/dashboard/[slug]/sales/page.tsx`. Tips are `kind === "tip"`.
- `GET /shifts/now` means "who is on the clock right now", with no tier gate. `GET /shifts?from&to[&mine]` returns shifts overlapping the window. Both reject windows over 60 days. Shift statuses are lowercase: `open | pending_approval | scheduled | active | completed | cancelled | missed | unfilled`.
- `GET /tasks` excludes completed and cancelled by default, orders most urgent first, and applies the venue's `task_visibility` server-side (managers always see all). `TaskRow.priority` is an int; `intToPriority` in `lib/api/task-convert.ts` maps it to `LOW|MEDIUM|HIGH|URGENT`.
- `MembershipRow.person` has only `{id, display_name, discord_id}`, with no character name (xvm-api#54 is open for that). The Live page's on-shift names therefore fall back to nickname or display name, the same regression the Shifts page already shipped with.
- `isXvmAuthFailure(err)` is `err instanceof XvmApiError && err.status === 401`. Pages that already use xvm-api log the error, call `invalidateXvmApiCredential(userId)` on an auth failure, and keep rendering with empty data (see `app/dashboard/[slug]/staff/page.tsx` lines 111-132).

## Behaviour changes to call out in the PR

1. (Corrected after final review) Overview "Open tasks" card is manager-only (`{canManage && (...)}`), so the task-visibility change has no visible effect.
2. Staff page "Tips pool (wk)" follows `sales_visibility`: a staff member at a venue with sales hidden sees 0, where Prisma showed everyone the venue-wide total.
3. Live page revenue is the venue's posted revenue since the event started (time window). The Prisma version used the event's own transactions, but there is no Prisma-cuid-to-xvm-int event bridge. Staff "own" scoping is now done by xvm-api.
4. Live page on-shift names lose the character name (see facts above).
5. Revenue values that were Prisma decimals are now minor units converted with `minorUnitsToDollars`, same as the Sales page.

## File structure

- Modify `lib/api/xvm-api.ts`: add `FinanceSummary` type + `getFinanceSummary`, add `listShiftsOnNow`.
- Modify `lib/api/xvm-api.test.ts`: tests for both wrappers.
- Create `lib/api/xvm-page-read.ts`: `xvmPageReader(userId, xvmApiVenueId)` returns a `read(label, fallback, call)` function. Used by all three pages, so the log / invalidate / fall-back pattern isn't pasted a dozen times.
- Create `lib/api/xvm-page-read.test.ts`.
- Modify `app/dashboard/[slug]/staff/page.tsx`: stats block.
- Modify `app/dashboard/[slug]/page.tsx`: revenue KPIs, per-event revenue, open tasks, my shifts.
- Modify `app/dashboard/[slug]/live/page.tsx`: revenue visibility, event revenue and count, on-shift staff.

---

### Task 1: xvm-api client wrappers

**Files:**
- Modify: `lib/api/xvm-api.ts` (after `listFinanceTransactions`; after `listShifts`)
- Test: `lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/api/xvm-api.test.ts`, add `getFinanceSummary,` and `listShiftsOnNow,` to the big import list, directly above the line `} from "./xvm-api"`. Then append this block at the end of the file:

```ts
describe("finance summary and on-now shifts", () => {
  it("getFinanceSummary GETs the summary for a window", async () => {
    const summary = {
      window_from: "2026-01-01T00:00:00Z",
      window_to: "2026-01-08T00:00:00Z",
      total_revenue: 5000,
      total_expense: 0,
      total_payout: 0,
      net: 5000,
      transaction_count: 2,
      category_totals: [],
    }
    mockFetchOnce({ ok: true, status: 200, body: summary })
    const result = await getFinanceSummary("token", "venue-1", {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-08T00:00:00.000Z",
    })
    expect(result).toEqual(summary)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions/summary?")
    expect(url).toContain("from=2026-01-01T00%3A00%3A00.000Z")
    expect(url).toContain("to=2026-01-08T00%3A00%3A00.000Z")
  })

  it("listShiftsOnNow GETs /shifts/now", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    const result = await listShiftsOnNow("token", "venue-1")
    expect(result).toEqual([])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toMatch(/\/venues\/venue-1\/shifts\/now$/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: FAIL, `getFinanceSummary is not a function` / `listShiftsOnNow is not a function`.

- [ ] **Step 3: Implement**

In `lib/api/xvm-api.ts`, directly after the closing `}` of `listFinanceTransactions`:

```ts
export interface FinanceSummary {
  window_from: string
  window_to: string
  total_revenue: number
  total_expense: number
  total_payout: number
  net: number
  transaction_count: number
  category_totals: { category_id: number | null; total: number }[]
}

export async function getFinanceSummary(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string }
): Promise<FinanceSummary> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  return xvmFetch<FinanceSummary>(`/venues/${venueId}/finance/transactions/summary?${params}`, {}, personToken)
}
```

Directly after the closing `}` of `listShifts`:

```ts
export async function listShiftsOnNow(personToken: string, venueId: string): Promise<ShiftRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ShiftRow[]>(`/venues/${venueId}/shifts/now`, {}, personToken)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: add getFinanceSummary and listShiftsOnNow client wrappers"
```

---

### Task 2: Shared server-side read helper

**Files:**
- Create: `lib/api/xvm-page-read.ts`
- Test: `lib/api/xvm-page-read.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/api/xvm-page-read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockGetToken, mockInvalidate } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockInvalidate: vi.fn(),
}))

vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: mockGetToken,
  invalidateXvmApiCredential: mockInvalidate,
  isXvmAuthFailure: (err: unknown) => (err as { status?: number }).status === 401,
}))

import { xvmPageReader } from "./xvm-page-read"

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("xvmPageReader", () => {
  it("returns the fallback without a token lookup when the venue is not connected", async () => {
    const read = await xvmPageReader("user-1", null)
    const call = vi.fn()
    expect(await read("t", 7, call)).toBe(7)
    expect(mockGetToken).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
  })

  it("returns the fallback when the user has no xvm-api token", async () => {
    mockGetToken.mockResolvedValue(null)
    const read = await xvmPageReader("user-1", "venue-1")
    const call = vi.fn()
    expect(await read("t", 7, call)).toBe(7)
    expect(call).not.toHaveBeenCalled()
  })

  it("passes token and venue id to the call and returns its result", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    const call = vi.fn().mockResolvedValue(42)
    expect(await read("t", 7, call)).toBe(42)
    expect(call).toHaveBeenCalledWith("tok", "venue-1")
  })

  it("returns the fallback and invalidates the credential on a 401", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    expect(await read("t", 7, () => Promise.reject({ status: 401 }))).toBe(7)
    expect(mockInvalidate).toHaveBeenCalledWith("user-1")
  })

  it("returns the fallback without invalidating on a non-auth error", async () => {
    mockGetToken.mockResolvedValue("tok")
    const read = await xvmPageReader("user-1", "venue-1")
    expect(await read("t", 7, () => Promise.reject({ status: 403 }))).toBe(7)
    expect(mockInvalidate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/api/xvm-page-read.test.ts`
Expected: FAIL, cannot resolve `./xvm-page-read`.

- [ ] **Step 3: Implement**

Create `lib/api/xvm-page-read.ts`:

```ts
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"

export type XvmPageRead = <T>(
  label: string,
  fallback: T,
  call: (token: string, xvmApiVenueId: string) => Promise<T>
) => Promise<T>

export async function xvmPageReader(userId: string, xvmApiVenueId: string | null): Promise<XvmPageRead> {
  const token = xvmApiVenueId ? await getValidXvmApiToken(userId) : null
  return async (label, fallback, call) => {
    if (!token || !xvmApiVenueId) return fallback
    try {
      return await call(token, xvmApiVenueId)
    } catch (err) {
      console.error(`[${label}] xvm-api read error:`, err)
      if (isXvmAuthFailure(err)) await invalidateXvmApiCredential(userId)
      return fallback
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/api/xvm-page-read.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-page-read.ts lib/api/xvm-page-read.test.ts
git commit -m "feat: add xvmPageReader for server-component xvm-api reads"
```

---

### Task 3: Staff page stats

**Files:**
- Modify: `app/dashboard/[slug]/staff/page.tsx`

- [ ] **Step 1: Update imports**

Replace the existing `@/lib/api/xvm-api` import block (`listMemberships, listPositions, listInvites, type MembershipRow, type PositionRow, type InviteRow`) with:

```ts
import {
  listMemberships,
  listPositions,
  listInvites,
  listShifts,
  listShiftsOnNow,
  listFinanceTransactions,
  type MembershipRow,
  type PositionRow,
  type InviteRow,
  type ShiftRow,
  type FinanceTransactionRow,
} from "@/lib/api/xvm-api"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { minorUnitsToDollars } from "@/lib/api/position-convert"
```

- [ ] **Step 2: Replace the Prisma stats block**

Keep the existing `weekAgo` declaration and the eslint-disable line above it. Replace everything from the line `// Active shifts + weekly stats` through `const tipsThisWeek = Number(weeklyTips._sum.amount ?? 0)` with:

```ts
  const statsTo = new Date(weekAgo.getTime() + 7 * 24 * 60 * 60 * 1000)
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const [activeShifts, weeklyShifts, weeklyTransactions] = await Promise.all([
    readXvm("staff page on-now", [] as ShiftRow[], (t, v) => listShiftsOnNow(t, v)),
    readXvm("staff page weekly shifts", [] as ShiftRow[], (t, v) =>
      listShifts(t, v, { from: weekAgo.toISOString(), to: statsTo.toISOString() })
    ),
    readXvm("staff page weekly tips", [] as FinanceTransactionRow[], (t, v) =>
      listFinanceTransactions(t, v, { from: weekAgo.toISOString(), to: statsTo.toISOString() })
    ),
  ])

  const hoursThisWeek = weeklyShifts.reduce((sum, s) => {
    if (s.status !== "completed" && s.status !== "active") return sum
    if (!s.scheduled_start || !s.scheduled_end || Date.parse(s.scheduled_start) < weekAgo.getTime()) return sum
    return sum + (Date.parse(s.scheduled_end) - Date.parse(s.scheduled_start)) / (1000 * 60 * 60)
  }, 0)
  const tipsThisWeek =
    minorUnitsToDollars(weeklyTransactions.filter((tx) => tx.kind === "tip").reduce((sum, tx) => sum + tx.amount, 0)) ??
    0
```

Notes for the implementer (do not add these as code comments):
- `statsTo` is derived from `weekAgo` rather than a second `Date.now()`, so the page keeps its single, already-lint-suppressed clock read.
- Tips are filtered client-side instead of with `kind=tip`, because the route-level `kind` param lives in the separate, unmerged PR #65.
- The JSX already uses `activeShifts.length`, `hoursThisWeek` and `tipsThisWeek`, so it doesn't change.

- [ ] **Step 3: Verify no Prisma shift/transaction reads remain and it typechecks**

Run: `grep -nE "prisma\.(shift|transaction)" "app/dashboard/[slug]/staff/page.tsx"; npx tsc --noEmit -p .`
Expected: grep prints nothing; tsc exits 0.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[slug]/staff/page.tsx"
git commit -m "fix: staff page stats read shifts and tips from xvm-api"
```

---

### Task 4: Overview page

**Files:**
- Modify: `app/dashboard/[slug]/page.tsx`

- [ ] **Step 1: Update imports**

Change the date-fns import to:

```ts
import { format, subDays, subWeeks, formatDistanceToNow, addDays } from "date-fns"
```

Add below the `@/lib/prisma` import:

```ts
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getFinanceSummary, listShifts, listTasks, type ShiftRow, type TaskRow } from "@/lib/api/xvm-api"
import { minorUnitsToDollars } from "@/lib/api/position-convert"
import { intToPriority } from "@/lib/api/task-convert"
```

- [ ] **Step 2: Replace `membershipId` with the reader and a revenue helper**

Replace the line `const membershipId = venue.memberships[0].id` with:

```ts
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const revenueBetween = (label: string, from: Date, to: Date) =>
    readXvm(label, 0, async (t, v) => {
      const summary = await getFinanceSummary(t, v, { from: from.toISOString(), to: to.toISOString() })
      return minorUnitsToDollars(summary.total_revenue) ?? 0
    })
```

(`membershipId` was only used by the Prisma "my shifts" query replaced in Step 5.)

- [ ] **Step 3: Replace the two weekly revenue aggregates**

In the `if (canManage)` block, replace the two `prisma.transaction.aggregate({...})` entries inside `Promise.all([...])` with:

```ts
      revenueBetween("overview revenue this week", weekAgo, now),
      revenueBetween("overview revenue prev week", twoWeeksAgo, weekAgo),
```

and in the `kpis = {...}` assignment below it, replace the two revenue lines with:

```ts
      revenueThisWeek: revThis,
      revenuePrev: revPrev,
```

- [ ] **Step 4: Replace per-event revenue**

Inside the `chartData` map callback, replace:

```ts
            const rev = await prisma.transaction.aggregate({
              where: {
                venueId: venue.id,
                createdAt: { gte: ev.startTime, lt: new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000) },
              },
              _sum: { amount: true },
            })
            return {
              label: format(ev.startTime, "d MMM"),
              revenue: Number(rev._sum.amount ?? 0),
```

with:

```ts
            const revenue = await revenueBetween(
              "overview event revenue",
              ev.startTime,
              new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000)
            )
            return {
              label: format(ev.startTime, "d MMM"),
              revenue,
```

- [ ] **Step 5: Replace open tasks and my shifts**

Replace the whole `// Open tasks (all roles see their own; managers see all)` comment and statement (`const openTasks = await prisma.task.findMany({...})`) with:

```ts
  const openTasks = (await readXvm("overview open tasks", [] as TaskRow[], (t, v) => listTasks(t, v)))
    .slice(0, 5)
    .map((task) => ({
      id: String(task.id),
      title: task.title,
      dueDate: task.due_at ? new Date(task.due_at) : null,
      priority: intToPriority(task.priority),
    }))
```

Replace the whole `// My upcoming shifts` comment and statement (`const myShifts = await prisma.shift.findMany({...})`) with:

```ts
  const myShiftsFrom = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const myShifts = (
    await readXvm("overview my shifts", [] as ShiftRow[], (t, v) =>
      listShifts(t, v, { from: myShiftsFrom.toISOString(), to: addDays(myShiftsFrom, 60).toISOString(), mine: true })
    )
  )
    .flatMap((s) =>
      (s.status === "scheduled" || s.status === "active") &&
      s.scheduled_start &&
      s.scheduled_end &&
      Date.parse(s.scheduled_start) >= myShiftsFrom.getTime()
        ? [{ id: s.id, status: s.status, scheduledStart: new Date(s.scheduled_start), scheduledEnd: new Date(s.scheduled_end) }]
        : []
    )
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
    .slice(0, 3)
```

- [ ] **Step 6: Update the my-shifts JSX status checks**

In the `myShifts.map((shift) => (...))` JSX, change every `shift.status === "ACTIVE"` to `shift.status === "active"`. Confirm with `grep -n 'shift.status === "ACTIVE"' "app/dashboard/[slug]/page.tsx"` before (3 hits) and after (0 hits).

- [ ] **Step 7: Verify**

Run: `grep -nE "prisma\.(shift|transaction|task)\.|membershipId" "app/dashboard/[slug]/page.tsx"; npx tsc --noEmit -p .`
Expected: grep prints nothing; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add "app/dashboard/[slug]/page.tsx"
git commit -m "fix: overview revenue, open tasks and my shifts read from xvm-api"
```

---

### Task 5: Live page

**Files:**
- Modify: `app/dashboard/[slug]/live/page.tsx`

- [ ] **Step 1: Update imports**

Remove `import { parseVenueSettings } from "@/lib/types/venue-settings"` and add:

```ts
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import {
  getVenue,
  getFinanceSummary,
  listShiftsOnNow,
  listMemberships,
  type FinanceSummary,
  type MembershipRow,
  type RevenueVisibility,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToDollars } from "@/lib/api/position-convert"
```

- [ ] **Step 2: Read revenue visibility from xvm-api**

Replace:

```ts
  const settings = parseVenueSettings(venue.settings)
  const showRevenue = canManage || settings.revenueVisibility === "all" || settings.revenueVisibility === "own"
```

with:

```ts
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)
  const revenueVisibility = await readXvm<RevenueVisibility>(
    "live page venue",
    "hide",
    async (t, v) => (await getVenue(t, v)).revenue_visibility
  )
  const showRevenue = canManage || revenueVisibility !== "hide"
```

The fallback is `"hide"` so a failed read never exposes revenue to staff (do not add this as a code comment).

- [ ] **Step 3: Drop the Prisma transaction includes from both event queries**

In both `prisma.event.findFirst({...})` calls, delete the whole `include: { transactions: { select: { amount: true, staffId: true } } },` property.

- [ ] **Step 4: Replace revenue and sale-count computation**

Replace everything from `// Calculate revenue (respect visibility)` through the end of the `saleCountDisplay` statement (including the comment above it) with:

```ts
  const eventStart = activeEvent?.startTime
  const eventSummary =
    eventStart && eventStart <= now && showRevenue
      ? await readXvm<FinanceSummary | null>("live page revenue", null, (t, v) =>
          getFinanceSummary(t, v, { from: eventStart.toISOString(), to: now.toISOString() })
        )
      : null
  const revenueDisplay = showRevenue ? (minorUnitsToDollars(eventSummary?.total_revenue ?? 0) ?? 0) : null
  const saleCountDisplay = eventSummary?.transaction_count ?? 0
```

xvm-api applies the `own` clamp itself, so there's no personal-revenue branch any more.

- [ ] **Step 5: Replace on-shift staff**

Replace the whole `// On-shift staff` comment and statement (`const activeShifts = await prisma.shift.findMany({...})`) with:

```ts
  const [onNow, roster] = await Promise.all([
    readXvm("live page on-now", [] as ShiftRow[], (t, v) => listShiftsOnNow(t, v)),
    readXvm("live page roster", [] as MembershipRow[], (t, v) => listMemberships(t, v)),
  ])
  const membersById = new Map(roster.map((m) => [m.id, m]))
  const onShiftStaff = onNow.slice(0, 10).map((s) => {
    const member = s.membership_id !== null ? membersById.get(s.membership_id) : undefined
    const name = resolveDisplayName({ nickname: member?.nickname, displayName: member?.person.display_name })
    return { name: name === "Unknown" ? "Staff" : name, role: member?.effective_tier.toUpperCase() ?? "STAFF" }
  })
```

- [ ] **Step 6: Update the `LiveDashboard` props**

Replace `scopeSalesToOwn={!canManage && settings.revenueVisibility === "own"}` with:

```tsx
            scopeSalesToOwn={!canManage && revenueVisibility === "own"}
```

Replace `revenueLabel={canManage || settings.revenueVisibility === "all" ? "Total Revenue" : "My Sales"}` with:

```tsx
            revenueLabel={canManage || revenueVisibility === "all" ? "Total Revenue" : "My Sales"}
```

Replace the whole `onShiftStaff={activeShifts.map((s) => { ... })}` prop with:

```tsx
            onShiftStaff={onShiftStaff}
```

- [ ] **Step 7: Verify**

Run: `grep -nE "prisma\.(shift|transaction)\.|settings\.revenueVisibility|parseVenueSettings" "app/dashboard/[slug]/live/page.tsx"; npx tsc --noEmit -p .`
Expected: grep prints nothing; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add "app/dashboard/[slug]/live/page.tsx"
git commit -m "fix: live page revenue, visibility and on-shift staff read from xvm-api"
```

---

### Task 6: Full verification

- [ ] **Step 1: Static checks**

Run: `npx tsc --noEmit -p . && pnpm run lint 2>&1 | tail -3 && pnpm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: tsc exit 0; lint `0 errors`; tests all pass (baseline 190 passed, plus 7 new).

- [ ] **Step 2: Live check (human, needs Discord OAuth on local dev)**

Against `pnpm dev` + local xvm-api (`docs/LOCAL_DEV.md`), on a connected venue:
- Overview as manager: "Revenue this week" matches the Sales page's last-7-days total; chart bars are non-zero for events with sales; open tasks match the Tasks page; "My shifts" lists your own scheduled/active shifts.
- Staff: "On shift now" equals the number clocked in on the Shifts page; tips equal the sum of this week's tips.
- Live with an ACTIVE event: revenue matches sales since event start; logging a sale ticks it up; as staff with Revenue visibility = Hide, revenue is hidden; with Own, the label reads "My Sales" and only own sales count.
