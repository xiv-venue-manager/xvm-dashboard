# Payroll Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the dashboard's Payroll feature (list, manual CRUD, hourly-shift generation, bulk generation) over from Prisma (`PayrollEntry`, `Shift.payrollEntryId`) to xvm-api's `financials.py` payroll endpoints (`/venues/{venue_id}/finance/payroll`), following the established cutover playbook.

**Architecture:** Same gate pattern as every prior cutover route: session → `getValidXvmApiToken` → `requireXvmVenueId` (local Prisma lookup, the only Prisma call) → xvm-api call. Money fields convert via the existing `dollarsToMinorUnits`/`minorUnitsToDollars`; a new hours↔minutes pair is added for `minutes_worked`. Shift-based generation is **reworked**, not ported as-is — see the three scope decisions below, each confirmed with the user after real investigation found the old mechanism doesn't map cleanly onto xvm-api's model.

**Tech Stack:** Next.js 15 App Router route handlers, Zod validation, Vitest, xvm-api (FastAPI) as the data source.

---

## Scope decisions (confirmed with the user, each backed by real investigation — do not relitigate)

1. **Manual/non-member entries are dropped.** The dashboard's `isManualEntry`/`manualEntryName` (a payroll line with no real venue membership, e.g. a one-off contractor) has no equivalent on xvm-api — `PayrollEntryCreate.membership_id` is a required `int`, not optional. Every payroll entry now requires a real membership. The create form's "Manual entry" toggle, name field, and the list's "Manual" badge are all removed, not ported.

2. **Editing an existing entry is narrower.** xvm-api's `PayrollEntryUpdate` only allows `is_paid` and `notes` — no editing `base_rate_minor`/`minutes_worked`/`bonus_amount_minor`/`period_start`/`period_end` after creation (the dashboard currently allows all of these via PATCH). `DELETE` only succeeds on an unpaid, non-pot-derived entry (xvm-api's own `delete_unpaid` — a pot-derived entry must be undone by voiding its distribution instead; forward the 404/409 xvm-api returns rather than re-implementing the check dashboard-side). This is a real capability reduction, not just a rename — call it out plainly in the PR body.

3. **Shift-based generation is reworked around two verified facts, not the old mechanism:**
   - **No shift↔payroll linkage exists on xvm-api.** `ShiftModel.payroll_entry_id` exists in xvm-api's schema but nothing in `ShiftUpdate` or any router endpoint lets you set it. So eligibility can't be an explicit link — it's computed by **time-window overlap**: a completed shift counts as "already paid" if its `actual_end` falls inside the `period_start`–`period_end` window of any existing payroll entry for that membership (both already listable via `GET /payroll` and `GET /shifts`).
   - **The old 3-tier rate chain (shift's tagged role → membership's personal override → membership's primary role) is mostly dead code.** Verified directly: nothing in the live UI or any API route writes `Membership.hourlyRate` or `Membership.roleId` — they're leftover fields from before Roles→Positions replaced them, always evaluating to `null`/unused in practice. The real, live rate source today is only the shift's tagged position (`ShiftRow.position_id` → `PositionRow.hourly_rate_minor`, already on xvm-api via the existing Positions cutover). The rework drops the dead fallback tiers entirely — a shift resolves a rate from its own position, or it doesn't.
   - **All-or-nothing, not silent partial exclusion.** The old code silently excluded any shift that couldn't resolve a rate and proceeded with the rest — under the window-overlap rework, once the payroll entry's date range covers that shift's timestamp, the excluded shift would look "already paid" forever with no record it was actually skipped. That's silent, permanent wage loss for a real person, which this codebase's own conventions treat as unacceptable (see `CLAUDE.md`'s ponytail-precedent note on the pagination-merge silent-data-loss fix). So: for **single-member generate**, if any eligible shift in the window has no resolvable position rate, the whole call fails with a clear error naming the unresolved shift(s) — nothing is created. For **generate-all** (bulk, per-venue), the same rule applies **per member**: a member whose shifts all resolve gets a payroll entry created; a member with even one unresolved shift is skipped entirely (matching the existing `skipped`/`skipReason` reporting shape, just changing the skip criterion from "no rate at all" to "any shift unresolved") — other members still get paid. Never partially pay one member while silently dropping one of their shifts.

---

## Task 1: Hours ↔ minutes conversion helpers

xvm-api stores worked time as `minutes_worked` (int). The dashboard's Prisma `PayrollEntry.hoursWorked` and the shift-duration math in `lib/payroll-rates.ts` both work in decimal hours. Add the missing pair, same file/style as the existing `dollarsToMinorUnits`/`percentToBasisPoints` helpers.

**Files:**
- Modify: `apps/web/lib/api/position-convert.ts`
- Modify: `apps/web/lib/api/position-convert.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/api/position-convert.test.ts`:

```typescript
describe("hoursToMinutes / minutesToHours round-trip", () => {
  it("converts decimal hours to whole minutes and back", () => {
    expect(hoursToMinutes(1.5)).toBe(90)
    expect(minutesToHours(90)).toBe(1.5)
  })

  it("returns null for null input on both directions", () => {
    expect(hoursToMinutes(null)).toBeNull()
    expect(minutesToHours(null)).toBeNull()
  })

  it("rounds to the nearest minute instead of truncating", () => {
    expect(hoursToMinutes(1.008)).toBe(60) // 1.008h = 60.48min -> rounds to 60
    expect(hoursToMinutes(1.01)).toBe(61) // 1.01h = 60.6min -> rounds to 61
  })
})
```

Update the import line at the top of that file to add `hoursToMinutes, minutesToHours`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/api/position-convert.test.ts`
Expected: FAIL — `hoursToMinutes is not defined`

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/api/position-convert.ts`:

```typescript
// xvm-api's minutes_worked is an int; the dashboard's hoursWorked (and the shift-duration
// math it comes from) is decimal hours. Round rather than truncate, same reasoning as the
// other minor-unit conversions here — a fractional minute from float math shouldn't
// silently shave time off someone's paid hours.
export function hoursToMinutes(hours: number | null): number | null {
  if (hours === null) return null
  return Math.round(hours * 60)
}

export function minutesToHours(minutes: number | null): number | null {
  if (minutes === null) return null
  return minutes / 60
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/api/position-convert.test.ts`
Expected: PASS, all tests in the file green

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/position-convert.ts apps/web/lib/api/position-convert.test.ts
git commit -m "feat: add hours/minutes conversion helpers for payroll cutover"
```

---

## Task 2: xvm-api client functions for payroll

Add typed request functions to `lib/api/xvm-api.ts`, matching the existing block style (`xvmFetch<T>`).

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1: Add the types and functions**

Append to the end of `apps/web/lib/api/xvm-api.ts`:

```typescript
// ── Payroll API ────────────────────────────────────────────────

export type PaymentType = "fixed_salary" | "hourly" | "pot_share"

export interface PayrollEntryRow {
  id: number
  membership_id: number | null
  person_id: number
  payment_type: PaymentType
  base_rate_minor: number
  minutes_worked: number | null
  bonus_amount_minor: number | null
  total_amount_minor: number
  period_start: string
  period_end: string
  is_paid: boolean
  paid_at: string | null
  paid_by_person_id: number | null
  pot_distribution_id: number | null
  notes: string | null
  created_at: string
}

export interface PayrollEntryCreate {
  membership_id: number
  payment_type: "fixed_salary" | "hourly"
  base_rate_minor: number
  minutes_worked?: number | null
  bonus_amount_minor?: number | null
  period_start: string
  period_end: string
  notes?: string | null
}

export interface PayrollEntryUpdate {
  is_paid?: boolean
  notes?: string | null
}

export async function listPayroll(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; isPaid?: boolean; membershipId?: number }
): Promise<PayrollEntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  if (opts.isPaid !== undefined) params.set("is_paid", String(opts.isPaid))
  if (opts.membershipId !== undefined) params.set("membership_id", String(opts.membershipId))
  return xvmFetch<PayrollEntryRow[]>(`/venues/${venueId}/finance/payroll?${params}`, {}, personToken)
}

export async function createPayrollEntry(
  personToken: string,
  venueId: string,
  data: PayrollEntryCreate
): Promise<PayrollEntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PayrollEntryRow>(
    `/venues/${venueId}/finance/payroll`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePayrollEntry(
  personToken: string,
  venueId: string,
  entryId: number,
  data: PayrollEntryUpdate
): Promise<PayrollEntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PayrollEntryRow>(
    `/venues/${venueId}/finance/payroll/${entryId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePayrollEntry(personToken: string, venueId: string, entryId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/finance/payroll/${entryId}`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat: add xvm-api client functions for payroll"
```

---

## Task 3: Cut `payroll/route.ts` over to xvm-api (list + manual create)

Rewrite the file: GET lists via xvm-api, POST creates a manual entry (membership required, no `isManualEntry` path). Preserve the existing external contract as closely as the scope decisions allow — same query params (`isPaid`, `membershipId`, `from`, `to`), same general response shape (a flat array of entries), converted at the route boundary.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/route.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/app/api/venues/[venueId]/payroll/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPayroll, createPayrollEntry, type PayrollEntryRow } from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes, minutesToHours } from "@/lib/api/position-convert"

const createPayrollSchema = z
  .object({
    membershipId: z.number().int(),
    paymentType: z.enum(["FIXED_SALARY", "HOURLY"]),
    baseRate: z.number().min(0).max(999999999),
    hoursWorked: z.number().min(0).max(9999).optional(),
    bonusAmount: z.number().min(0).max(999999999).optional(),
    periodStart: z.string(),
    periodEnd: z.string(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })
  .refine((data) => data.paymentType !== "HOURLY" || data.hoursWorked !== undefined, {
    message: "Hours worked is required for hourly payments",
    path: ["hoursWorked"],
  })

function toPaymentTypeApi(t: "FIXED_SALARY" | "HOURLY"): "fixed_salary" | "hourly" {
  return t === "FIXED_SALARY" ? "fixed_salary" : "hourly"
}

function toDashboardEntry(row: PayrollEntryRow) {
  return {
    id: row.id,
    membershipId: row.membership_id,
    paymentType: row.payment_type === "fixed_salary" ? "FIXED_SALARY" : row.payment_type === "hourly" ? "HOURLY" : "POT_SHARE",
    baseRate: minorUnitsToDollars(row.base_rate_minor),
    hoursWorked: minutesToHours(row.minutes_worked),
    bonusAmount: row.bonus_amount_minor !== null ? minorUnitsToDollars(row.bonus_amount_minor) : null,
    totalAmount: minorUnitsToDollars(row.total_amount_minor),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    isPaid: row.is_paid,
    paidAt: row.paid_at,
    potDistributionId: row.pot_distribution_id,
    notes: row.notes,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const searchParams = request.nextUrl.searchParams
    const isPaidFilter = searchParams.get("isPaid")
    const membershipIdParam = searchParams.get("membershipId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 })

    try {
      const rows = await listPayroll(token, gate.xvmApiVenueId!, {
        from,
        to,
        isPaid: isPaidFilter !== null ? isPaidFilter === "true" : undefined,
        membershipId: membershipIdParam ? Number(membershipIdParam) : undefined,
      })
      return NextResponse.json(rows.map(toDashboardEntry))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createPayrollSchema>
    try {
      data = createPayrollSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
        membership_id: data.membershipId,
        payment_type: toPaymentTypeApi(data.paymentType),
        base_rate_minor: dollarsToMinorUnits(data.baseRate)!,
        minutes_worked: data.hoursWorked !== undefined ? hoursToMinutes(data.hoursWorked) : undefined,
        bonus_amount_minor: data.bonusAmount !== undefined ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined) : undefined,
        period_start: new Date(data.periodStart).toISOString(),
        period_end: new Date(data.periodEnd).toISOString(),
        notes: data.notes,
      })
      return NextResponse.json(toDashboardEntry(row), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: errors in `payroll/page.tsx` (still expects `isManualEntry`, `manualEntryName`, and a `from`/`to`-less GET call, plus the old `hoursWorked`-as-string PATCH shape) — expected at this point, fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/route.ts
git commit -m "feat: cut payroll list+create route over to xvm-api"
```

---

## Task 4: Cut `payroll/[payrollId]/route.ts` over to xvm-api (PATCH + DELETE)

PATCH only accepts `isPaid`/`notes` now (matches xvm-api's `PayrollEntryUpdate`). DELETE forwards whatever xvm-api returns (404 not found, 409 if paid or pot-derived) rather than re-implementing that check.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updatePayrollEntry, deletePayrollEntry, type PayrollEntryRow } from "@/lib/api/xvm-api"
import { minorUnitsToDollars, minutesToHours } from "@/lib/api/position-convert"

const patchSchema = z
  .object({
    isPaid: z.boolean().optional(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()

function toDashboardEntry(row: PayrollEntryRow) {
  return {
    id: row.id,
    membershipId: row.membership_id,
    paymentType: row.payment_type === "fixed_salary" ? "FIXED_SALARY" : row.payment_type === "hourly" ? "HOURLY" : "POT_SHARE",
    baseRate: minorUnitsToDollars(row.base_rate_minor),
    hoursWorked: minutesToHours(row.minutes_worked),
    bonusAmount: row.bonus_amount_minor !== null ? minorUnitsToDollars(row.bonus_amount_minor) : null,
    totalAmount: minorUnitsToDollars(row.total_amount_minor),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    isPaid: row.is_paid,
    paidAt: row.paid_at,
    potDistributionId: row.pot_distribution_id,
    notes: row.notes,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId, payrollId } = await context.params
    const entryId = Number(payrollId)
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid payroll entry id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof patchSchema>
    try {
      data = patchSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const row = await updatePayrollEntry(token, gate.xvmApiVenueId!, entryId, {
        is_paid: data.isPaid,
        notes: data.notes,
      })
      return NextResponse.json(toDashboardEntry(row))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId, payrollId } = await context.params
    const entryId = Number(payrollId)
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid payroll entry id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deletePayrollEntry(token, gate.xvmApiVenueId!, entryId)
      return NextResponse.json({ success: true, message: "Payroll entry deleted" })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: same pre-existing `payroll/page.tsx` errors as after Task 3 (not fixed until Task 5), no new errors from this file itself.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/\[payrollId\]/route.ts
git commit -m "feat: cut payroll update+delete route over to xvm-api"
```

---

## Task 5: Update `payroll/page.tsx` — remove manual entries and narrowed-edit fields

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/payroll/page.tsx`

This file is 1378 lines and wasn't fully read line-by-line while writing this plan — the previous three tasks' route contracts are exact, but this task requires you to read the actual current file yourself and make the following semantic changes precisely, rather than following a literal find/replace (the plan gives you the *what*, you confirm the *where* against the real file).

- [ ] **Step 1: Read the file in full**

Read `apps/web/app/dashboard/[slug]/payroll/page.tsx` completely before making any edits. Note every location that references: `isManualEntry`, `manualEntryName`, the PATCH-editable fields (`baseRate`, `hoursWorked`, `bonusAmount`, `periodStart`, `periodEnd` — everywhere they appear in an *edit-existing-entry* context, not the *create-new-entry* form, which is unaffected), and how the list fetch currently calls `GET /api/venues/[venueId]/payroll` (with or without `from`/`to` query params — the route now requires them per Task 3's `if (!from || !to) return 400`).

- [ ] **Step 2: Remove manual-entry UI**

Remove: the "Manual entry" checkbox/toggle in the create form, the manual-entry-name text input, the conditional logic that swaps "select staff member" for "enter a name" based on the toggle, the `isManualEntry`/`manualEntryName` state variables, their inclusion in the POST body, and the "Manual" badge shown next to manual entries in the list. The create form now always requires selecting a real staff member (`membershipId`).

- [ ] **Step 3: Narrow the edit-existing-entry UI**

Wherever the page lets a user edit `baseRate`/`hoursWorked`/`bonusAmount`/`periodStart`/`periodEnd` on an *already-created* entry (as opposed to the initial create form), remove those fields from the edit flow — only "mark as paid/unpaid" (the `isPaid` toggle) and editing `notes` remain editable after creation. If the current UI conflates "create" and "edit" in one form/modal, split them so the create path keeps all its current fields (unaffected by this task) while the edit path only exposes `isPaid` + `notes`.

- [ ] **Step 4: Ensure the list fetch passes `from`/`to`**

The GET route now requires `from`/`to` query params (previously optional). Confirm the page's fetch call to `/api/venues/${venueId}/payroll` always includes them — if the page currently has a "show all" mode with no date filter, give it a sensible default range (e.g. the currently-selected period, or a wide default like the last 12 months) rather than omitting the params.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/payroll/page.tsx
git commit -m "feat: remove manual-entry and narrowed-edit UI from payroll page"
```

---

## Task 6: Rework `payroll/generate/route.ts` — single-member shift generation

Full rewrite. GET previews (no mutation), POST creates. Eligibility is now window-overlap based (query existing payroll entries for the membership, exclude shifts whose `actual_end` falls inside any existing entry's period). Rate resolution is position-only (no membership override, no primary-role fallback — both confirmed dead). All-or-nothing: any eligible shift with no position or an unrated position fails the whole call.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  listShiftsChunked,
  listPositions,
  listPayroll,
  createPayrollEntry,
  type ShiftRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes, minutesToHours } from "@/lib/api/position-convert"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

interface ResolvedShift {
  shift: ShiftRow
  hours: number
  rateMinorPerHour: number | null
}

/**
 * Eligible shifts: completed, belong to this membership, actual_end inside the
 * window, and NOT already covered by an existing payroll entry's period for this
 * membership (window-overlap is the only eligibility signal available - xvm-api
 * has no explicit shift-to-payroll-entry link).
 */
async function findEligibleShifts(
  token: string,
  xvmApiVenueId: string,
  membershipId: number,
  from: string,
  to: string
): Promise<ShiftRow[]> {
  const [shifts, existingEntries] = await Promise.all([
    listShiftsChunked(token, xvmApiVenueId, { from, to }),
    listPayroll(token, xvmApiVenueId, { from, to, membershipId }),
  ])

  const completed = shifts.filter(
    (s) => s.status === "completed" && s.membership_id === membershipId && s.actual_end !== null
  )

  return completed.filter((shift) => {
    const shiftEnd = new Date(shift.actual_end!).getTime()
    return !existingEntries.some((entry) => {
      const start = new Date(entry.period_start).getTime()
      const end = new Date(entry.period_end).getTime()
      return shiftEnd >= start && shiftEnd <= end
    })
  })
}

async function resolveRates(token: string, xvmApiVenueId: string, shifts: ShiftRow[]): Promise<ResolvedShift[]> {
  const positions = await listPositions(token, xvmApiVenueId)
  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))

  return shifts.map((shift) => {
    const start = shift.actual_start ? new Date(shift.actual_start).getTime() : null
    const end = shift.actual_end ? new Date(shift.actual_end).getTime() : null
    const hours = start !== null && end !== null ? Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100 : 0

    const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
    const rateMinorPerHour = position?.hourly_rate_minor ?? null

    return { shift, hours, rateMinorPerHour }
  })
}

function summarize(resolved: ResolvedShift[]) {
  const unresolved = resolved.filter((r) => r.rateMinorPerHour === null)
  const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
  const totalAmountMinor = resolved.reduce((sum, r) => sum + Math.round(r.hours * (r.rateMinorPerHour ?? 0)), 0)
  return { unresolved, totalHours, totalAmountMinor }
}

const generateSchema = z
  .object({
    membershipId: z.number().int(),
    periodStart: z.string(),
    periodEnd: z.string(),
    bonusAmount: z.number().min(0).max(999999999).optional(),
    notes: z.string().max(10000).optional().nullable(),
  })
  .strict()
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const sp = request.nextUrl.searchParams
    const membershipIdParam = sp.get("membershipId")
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!membershipIdParam || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "membershipId, periodStart, and periodEnd are required" }, { status: 400 })
    }
    const membershipId = Number(membershipIdParam)

    try {
      const eligible = await findEligibleShifts(token, gate.xvmApiVenueId!, membershipId, periodStart, periodEnd)
      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)

      return NextResponse.json({
        shifts: resolved.map((r) => ({
          id: r.shift.id,
          actualStart: r.shift.actual_start,
          actualEnd: r.shift.actual_end,
          hoursWorked: r.hours,
          resolvedRate: r.rateMinorPerHour !== null ? minorUnitsToDollars(r.rateMinorPerHour) : null,
        })),
        summary: {
          shiftCount: eligible.length,
          totalHours,
          estimatedTotal: unresolved.length === 0 ? minorUnitsToDollars(totalAmountMinor) : null,
          unresolvedShiftCount: unresolved.length,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof generateSchema>
    try {
      data = generateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        data.membershipId,
        data.periodStart,
        data.periodEnd
      )
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No unpaid completed shifts found in this period" }, { status: 400 })
      }

      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)

      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            error: "Some shifts in this period have no resolvable rate",
            unresolvedShiftIds: unresolved.map((r) => r.shift.id),
          },
          { status: 409 }
        )
      }

      const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
        membership_id: data.membershipId,
        payment_type: "hourly",
        base_rate_minor: totalHours > 0 ? Math.round(totalAmountMinor / totalHours) : 0,
        minutes_worked: hoursToMinutes(totalHours)!,
        bonus_amount_minor: data.bonusAmount !== undefined ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined) : undefined,
        period_start: new Date(data.periodStart).toISOString(),
        period_end: new Date(data.periodEnd).toISOString(),
        notes: data.notes,
      })

      return NextResponse.json(
        {
          id: row.id,
          totalAmount: minorUnitsToDollars(row.total_amount_minor),
          hoursWorked: minutesToHours(row.minutes_worked),
          shiftsLinked: eligible.length,
        },
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors from this file (some pre-existing `payroll/page.tsx` errors may remain if Task 5 didn't touch the generate-flow UI yet — check against Task 7's scope, not this file's)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/generate/route.ts
git commit -m "feat: rework payroll generate route for xvm-api (window-overlap eligibility, position-only rates, all-or-nothing)"
```

---

## Task 7: Rework `payroll/generate-all/route.ts` — bulk generation

Same rework as Task 6, applied per active member. A member whose shifts all resolve gets a payroll entry; a member with any unresolved shift is skipped (not failed) — matches the existing `skipped`/`skipReason` reporting shape.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listMemberships, listShiftsChunked, listPositions, listPayroll, createPayrollEntry, type ShiftRow, type PositionRow, type MembershipRow } from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes } from "@/lib/api/position-convert"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

interface MemberResult {
  member: MembershipRow
  eligibleShiftIds: number[]
  totalHours: number
  totalAmountMinor: number
  skipped: boolean
  skipReason: "no_shifts" | "unresolved_rate" | null
}

async function computeAllMembers(
  token: string,
  xvmApiVenueId: string,
  periodStart: string,
  periodEnd: string
): Promise<MemberResult[]> {
  const [members, shifts, positions, existingEntries] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listShiftsChunked(token, xvmApiVenueId, { from: periodStart, to: periodEnd }),
    listPositions(token, xvmApiVenueId),
    listPayroll(token, xvmApiVenueId, { from: periodStart, to: periodEnd }),
  ])

  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))
  const completedShifts = shifts.filter((s) => s.status === "completed" && s.actual_end !== null)

  return members.map((member) => {
    const entriesForMember = existingEntries.filter((e) => e.membership_id === member.id)
    const memberShifts = completedShifts.filter((s) => s.membership_id === member.id)

    const eligible = memberShifts.filter((shift) => {
      const shiftEnd = new Date(shift.actual_end!).getTime()
      return !entriesForMember.some((entry) => {
        const start = new Date(entry.period_start).getTime()
        const end = new Date(entry.period_end).getTime()
        return shiftEnd >= start && shiftEnd <= end
      })
    })

    if (eligible.length === 0) {
      return { member, eligibleShiftIds: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "no_shifts" }
    }

    let totalHours = 0
    let totalAmountMinor = 0
    let anyUnresolved = false

    for (const shift of eligible) {
      const start = shift.actual_start ? new Date(shift.actual_start).getTime() : null
      const end = shift.actual_end ? new Date(shift.actual_end).getTime() : null
      const hours = start !== null && end !== null ? Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100 : 0
      const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
      const rateMinorPerHour = position?.hourly_rate_minor ?? null

      if (rateMinorPerHour === null) {
        anyUnresolved = true
        break
      }
      totalHours += hours
      totalAmountMinor += Math.round(hours * rateMinorPerHour)
    }

    if (anyUnresolved) {
      return { member, eligibleShiftIds: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "unresolved_rate" }
    }

    return {
      member,
      eligibleShiftIds: eligible.map((s) => s.id),
      totalHours,
      totalAmountMinor,
      skipped: false,
      skipReason: null,
    }
  })
}

const generateAllSchema = z
  .object({ periodStart: z.string(), periodEnd: z.string() })
  .strict()
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  })

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const sp = request.nextUrl.searchParams
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 })
    }

    try {
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, periodStart, periodEnd)
      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          shiftCount: r.eligibleShiftIds.length,
          totalHours: r.totalHours,
          estimatedTotal: r.skipped ? null : minorUnitsToDollars(r.totalAmountMinor),
          skipped: r.skipped,
          skipReason: r.skipReason,
        })),
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate-all] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof generateAllSchema>
    try {
      data = generateAllSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, data.periodStart, data.periodEnd)
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })
      }

      const created = []
      for (const r of eligible) {
        const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
          membership_id: r.member.id,
          payment_type: "hourly",
          base_rate_minor: r.totalHours > 0 ? Math.round(r.totalAmountMinor / r.totalHours) : 0,
          minutes_worked: hoursToMinutes(r.totalHours)!,
          period_start: new Date(data.periodStart).toISOString(),
          period_end: new Date(data.periodEnd).toISOString(),
        })
        created.push({
          membershipId: r.member.id,
          shiftCount: r.eligibleShiftIds.length,
          totalHours: r.totalHours,
          totalAmount: minorUnitsToDollars(row.total_amount_minor),
        })
      }

      return NextResponse.json(
        { generated: created.length, skipped: results.filter((r) => r.skipped).length, entries: created },
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate-all] POST error")
    }
  },
  { requests: 5, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors from this file. If `listMemberships`/`MembershipRow` aren't already imported/exported correctly from `xvm-api.ts`, fix the import — they should already exist from the earlier Roles→Positions cutover; if the exact export names differ from what's used above, match the real names rather than renaming the existing client.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/generate-all/route.ts
git commit -m "feat: rework payroll generate-all route for xvm-api"
```

---

## Task 8: Update `payroll/page.tsx` generate/generate-all UI, and live verification

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/payroll/page.tsx` (if the generate/generate-all flows render anything that no longer matches the new response shapes — e.g. `unresolvedShiftCount` semantics changed slightly, the POST error shape for an unresolved-rate failure is now `{ error, unresolvedShiftIds }` with a 409 instead of always succeeding with partial exclusion)

- [ ] **Step 1: Read the generate/generate-all sections of the page**

Confirm how the page currently handles the POST response for single-member generate and bulk generate-all. Update error handling to surface the new 409 "some shifts have no resolvable rate" case clearly to the user (e.g. show which shift IDs are blocking, or at minimum a clear message naming the count) — this is a new failure mode that didn't exist before (previously it silently excluded and succeeded), so the UI needs to represent "generation was blocked, fix the rate first" rather than assuming generate always succeeds when eligible shifts exist.

- [ ] **Step 2: Type-check and test**

Run: `cd apps/web && pnpm exec tsc --noEmit` — expect clean
Run: `cd apps/web && pnpm vitest run` — expect PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/payroll/page.tsx
git commit -m "feat: surface all-or-nothing generate failures in the payroll UI"
```

- [ ] **Step 4: Live verification**

Start the local stack (`docker compose -f docker-compose.local.yml up -d`, local xvm-api instance, `pnpm dev`). As a Manager on an xvm-api-connected venue with real staff/shifts/positions data:
- List payroll entries, confirm they load and filter correctly.
- Create a manual entry against a real membership, confirm it appears and the amount is correct.
- Mark it paid, confirm `isPaid`/`paidAt` update; confirm you can no longer delete it (xvm-api's unpaid-only delete rule) and get a clear error, not a crash.
- Create a second unpaid entry, delete it, confirm it's gone.
- With a membership that has completed, position-tagged shifts in a date range: preview generate, confirm hours/rate/total look right, generate, confirm the entry is created and re-running generate for the same range now shows those shifts as ineligible (window-overlap working).
- If a real venue has a membership with a shift on an untagged/unrated position: confirm generate fails clearly with the 409, naming the issue, rather than silently succeeding with a smaller number.
- Try generate-all across a couple of members, confirm the per-member skip/generate split works and reports correctly.

- [ ] **Step 5: Report results**

If anything doesn't match, fix it before considering this plan complete.

---

## Self-Review Notes

- **Spec coverage:** list+manual CRUD (Tasks 3-4), UI updates for both manual-entry removal and narrowed editing (Task 5), single-member generate rework (Task 6), bulk generate-all rework (Task 7), UI error handling for the new all-or-nothing failure mode + live verification (Task 8), conversion helpers (Task 1), client functions (Task 2).
- **All three scope decisions** (manual entries dropped, narrower PATCH/DELETE, window-overlap + all-or-nothing generation) are explicit, confirmed-with-user decisions documented at the top — not silently assumed anywhere in the task code.
- **No Prisma fallback:** every route's only Prisma call is the `xvmApiVenueId` gate lookup.
- **Known open question for the implementer to verify, not assume:** Task 7's `listMemberships`/`MembershipRow` import names are written from memory of the earlier Positions cutover — confirm the actual exported names in `xvm-api.ts` match before relying on them, and adjust the plan's code to the real signatures if they differ.
