# Financials: Categories + Payroll Settings Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the dashboard's finance category management and pot-payroll settings over from Prisma (`VenuePotSettings`) to xvm-api's `financials.py` router (`/venues/{venue_id}/finance/settings`, `/venues/{venue_id}/finance/categories`), as the first slice of the larger financials cutover (transactions/pot/payroll follow in later plans).

**Architecture:** Follow the established cutover playbook exactly (see `hours/route.ts`): each Next.js route resolves `xvmApiVenueId` via one small local Prisma lookup (the only Prisma call left in these routes), then calls xvm-api for the actual read/write. No dual-write, no Prisma fallback once a route is cut over. Money/percent fields get small tested conversion helpers, same pattern as `lib/api/position-convert.ts`.

**Tech Stack:** Next.js 15 App Router route handlers, Zod validation, Vitest, xvm-api (FastAPI) as the data source.

**Scope decision (confirmed with user before writing this plan):** xvm-api's `PayrollSettingsRow` has no `enabled` on/off field — the dashboard's Prisma `VenuePotSettings.enabled` toggle is dropped entirely. The pot-payroll settings UI is now always shown once the venue is xvm-api-connected. No xvm-api issue filed for this — it's a deliberate simplification, not a deferred gap.

---

## Task 1: Conversion helpers — percent ↔ basis points

xvm-api stores tax rate as `tax_basis_points` (int, 0–10000, where 100 = 1%). The dashboard UI and Prisma both used a 0–100 percent `Decimal`. `lib/api/position-convert.ts` already has `dollarsToMinorUnits`/`minorUnitsToDollars` for the currency half of this pattern — this task adds the missing percent/basis-points pair as tested pure functions, following that exact file's style.

**Files:**
- Modify: `apps/web/lib/api/position-convert.ts`
- Modify: `apps/web/lib/api/position-convert.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `apps/web/lib/api/position-convert.test.ts`:

```typescript
describe("percentToBasisPoints / basisPointsToPercent round-trip", () => {
  it("converts a percent to basis points and back", () => {
    expect(percentToBasisPoints(5)).toBe(500)
    expect(basisPointsToPercent(500)).toBe(5)
  })

  it("handles fractional percents", () => {
    expect(percentToBasisPoints(12.5)).toBe(1250)
    expect(basisPointsToPercent(1250)).toBe(12.5)
  })

  it("returns null for null input on both directions", () => {
    expect(percentToBasisPoints(null)).toBeNull()
    expect(basisPointsToPercent(null)).toBeNull()
  })

  it("rounds to the nearest basis point instead of truncating", () => {
    expect(percentToBasisPoints(12.505)).toBe(1251)
  })
})
```

And update the import line at the top of that file:

```typescript
import {
  hexColorToInt,
  intColorToHex,
  dollarsToMinorUnits,
  minorUnitsToDollars,
  percentToBasisPoints,
  basisPointsToPercent,
} from "./position-convert"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/api/position-convert.test.ts`
Expected: FAIL — `percentToBasisPoints is not defined` (or a TypeScript error to that effect)

- [ ] **Step 3: Write the implementation**

Add to the end of `apps/web/lib/api/position-convert.ts`:

```typescript
// xvm-api's tax_basis_points is an int (100 = 1%); the dashboard UI and Prisma's
// VenuePotSettings.taxPercent both use a 0-100 percent. Round rather than truncate
// for the same reason as dollarsToMinorUnits: a fractional basis point from float
// math shouldn't silently shave precision off the stored rate.
export function percentToBasisPoints(percent: number | null): number | null {
  if (percent === null) return null
  return Math.round(percent * 100)
}

export function basisPointsToPercent(basisPoints: number | null): number | null {
  if (basisPoints === null) return null
  return basisPoints / 100
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/api/position-convert.test.ts`
Expected: PASS, all tests in the file green

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/position-convert.ts apps/web/lib/api/position-convert.test.ts
git commit -m "feat: add percent/basis-points conversion helpers for financials cutover"
```

---

## Task 2: xvm-api client functions — settings + categories

Add the typed request functions to `lib/api/xvm-api.ts`, following the exact style of the existing `listPositions`/`createPosition`/`updatePosition`/`deletePosition` block (same file, `xvmFetch<T>(path, options, personToken)` helper already defined at the top of the file).

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1: Add the types and functions**

Append to the end of `apps/web/lib/api/xvm-api.ts`:

```typescript
// ── Finance API ────────────────────────────────────────────────

export interface FinanceSettingsRow {
  tax_basis_points: number
  include_sales_in_pot: boolean
  default_tip_pooled: boolean
  auto_generate_payroll: boolean
  auto_close_after_hours: number | null
  payout_rounding_minor: number
}

export interface FinanceSettingsUpdate {
  tax_basis_points?: number
  include_sales_in_pot?: boolean
  default_tip_pooled?: boolean
  auto_generate_payroll?: boolean
  auto_close_after_hours?: number | null
  payout_rounding_minor?: number
}

export async function getFinanceSettings(personToken: string, venueId: string): Promise<FinanceSettingsRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceSettingsRow>(`/venues/${venueId}/finance/settings`, {}, personToken)
}

export async function updateFinanceSettings(
  personToken: string,
  venueId: string,
  data: FinanceSettingsUpdate
): Promise<FinanceSettingsRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceSettingsRow>(
    `/venues/${venueId}/finance/settings`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export type FinanceEntryType = "revenue" | "expense" | "payout"

export interface FinanceCategoryRow {
  id: number
  name: string
  sort_order: number
  applies_to: FinanceEntryType | null
}

export interface FinanceCategoryCreate {
  name: string
  sort_order?: number
  applies_to?: FinanceEntryType | null
}

export interface FinanceCategoryUpdate {
  name?: string
  sort_order?: number
  applies_to?: FinanceEntryType | null
}

export async function listFinanceCategories(personToken: string, venueId: string): Promise<FinanceCategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow[]>(`/venues/${venueId}/finance/categories`, {}, personToken)
}

export async function createFinanceCategory(
  personToken: string,
  venueId: string,
  data: FinanceCategoryCreate
): Promise<FinanceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow>(
    `/venues/${venueId}/finance/categories`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateFinanceCategory(
  personToken: string,
  venueId: string,
  categoryId: number,
  data: FinanceCategoryUpdate
): Promise<FinanceCategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<FinanceCategoryRow>(
    `/venues/${venueId}/finance/categories/${categoryId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteFinanceCategory(
  personToken: string,
  venueId: string,
  categoryId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/finance/categories/${categoryId}`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat: add xvm-api client functions for finance settings and categories"
```

---

## Task 3: Cut `pot-settings` route over to xvm-api

Rewrite `app/api/venues/[venueId]/pot-settings/route.ts` to follow the `hours/route.ts` gate pattern exactly: session auth → `getValidXvmApiToken` → `requireXvmVenueId` → call xvm-api. Keep the route's own external contract (`GET`/`PUT`, `{ settings: {...} }` response shape, `taxPercent` as a 0-100 number) unchanged so `settings/page.tsx` needs minimal changes — the conversion to/from xvm-api's basis-points shape happens inside this route. Drop `enabled` entirely per the scope decision above.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/pot-settings/route.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `apps/web/app/api/venues/[venueId]/pot-settings/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getFinanceSettings, updateFinanceSettings } from "@/lib/api/xvm-api"
import { percentToBasisPoints, basisPointsToPercent } from "@/lib/api/position-convert"

const updatePotSettingsSchema = z.object({
  taxPercent: z.number().min(0).max(100).optional(),
  includeSalesInPot: z.boolean().optional(),
  defaultTipPooled: z.boolean().optional(),
})

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
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const settings = await getFinanceSettings(token, gate.xvmApiVenueId!)
      return NextResponse.json({
        settings: {
          taxPercent: basisPointsToPercent(settings.tax_basis_points),
          includeSalesInPot: settings.include_sales_in_pot,
          defaultTipPooled: settings.default_tip_pooled,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[pot-settings] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updatePotSettingsSchema>
    try {
      data = updatePotSettingsSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const settings = await updateFinanceSettings(token, gate.xvmApiVenueId!, {
        tax_basis_points: percentToBasisPoints(data.taxPercent ?? null) ?? undefined,
        include_sales_in_pot: data.includeSalesInPot,
        default_tip_pooled: data.defaultTipPooled,
      })
      return NextResponse.json({
        settings: {
          taxPercent: basisPointsToPercent(settings.tax_basis_points),
          includeSalesInPot: settings.include_sales_in_pot,
          defaultTipPooled: settings.default_tip_pooled,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[pot-settings] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: errors in `settings/page.tsx` referencing `potEnabled`/`setPotEnabled` and the `enabled` field — expected at this point, fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/pot-settings/route.ts
git commit -m "feat: cut pot-settings route over to xvm-api finance settings"
```

---

## Task 4: Update `settings/page.tsx` — drop the `enabled` toggle

Remove `potEnabled` state and the checkbox that gated the pot section, per the scope decision. The tax percent, include-sales, and default-tip-pooled fields now render unconditionally.

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Remove the `potEnabled` state declaration**

Find (near line 107):

```typescript
  const [potEnabled, setPotEnabled] = useState(false)
  const [potTaxPercent, setPotTaxPercent] = useState(0)
```

Replace with:

```typescript
  const [potTaxPercent, setPotTaxPercent] = useState(0)
```

- [ ] **Step 2: Remove `potEnabled` from the fetch handler**

Find (near line 205-213):

```typescript
        fetch(`/api/venues/${venue.id}/pot-settings`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return
            setPotEnabled(data.settings.enabled)
            setPotTaxPercent(data.settings.taxPercent)
            setPotIncludeSalesInPot(data.settings.includeSalesInPot)
            setPotDefaultTipPooled(data.settings.defaultTipPooled)
          })
          .catch(() => {})
```

Replace with:

```typescript
        fetch(`/api/venues/${venue.id}/pot-settings`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return
            setPotTaxPercent(data.settings.taxPercent)
            setPotIncludeSalesInPot(data.settings.includeSalesInPot)
            setPotDefaultTipPooled(data.settings.defaultTipPooled)
          })
          .catch(() => {})
```

- [ ] **Step 3: Remove `potEnabled` from the dirty-check dependency array**

Find (near line 257):

```typescript
    potEnabled,
    potTaxPercent,
```

Replace with:

```typescript
    potTaxPercent,
```

- [ ] **Step 4: Remove `enabled` from the save payload**

Find (near line 311-320):

```typescript
      const potSettingsRes = await fetch(`/api/venues/${venueId}/pot-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: potEnabled,
          taxPercent: potTaxPercent,
          includeSalesInPot: potIncludeSalesInPot,
          defaultTipPooled: potDefaultTipPooled,
        }),
      })
```

Replace with:

```typescript
      const potSettingsRes = await fetch(`/api/venues/${venueId}/pot-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxPercent: potTaxPercent,
          includeSalesInPot: potIncludeSalesInPot,
          defaultTipPooled: potDefaultTipPooled,
        }),
      })
```

- [ ] **Step 5: Remove the toggle checkbox and always render the fields**

Find (near line 1551-1594):

```typescript
                <label className="flex items-center gap-2 cursor-pointer ml-auto shrink-0">
                  <input
                    type="checkbox"
                    checked={potEnabled}
                    onChange={(e) => setPotEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{potEnabled ? "Enabled" : "Disabled"}</span>
                </label>
                {potEnabled && (
                  <div className="w-full pl-[54px] space-y-4">
```

Replace with:

```typescript
                <div className="w-full pl-[54px] space-y-4">
```

And find the matching closing tag a few lines later (near line 1593):

```typescript
                  </div>
                )}
              </div>
```

Replace with:

```typescript
                  </div>
              </div>
```

- [ ] **Step 6: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Run the full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS, same count as baseline plus the 4 new conversion-helper tests from Task 1

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: drop pot-payroll enabled toggle, always show settings"
```

---

## Task 5: Finance categories routes

New routes — categories have no Prisma equivalent today, this is net-new against an already-built xvm-api endpoint. Two files: list+create, and update+delete by id. Same gate pattern as every other cutover route.

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/finance-categories/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/finance-categories/[categoryId]/route.ts`

- [ ] **Step 1: Write the list+create route**

Create `apps/web/app/api/venues/[venueId]/finance-categories/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listFinanceCategories, createFinanceCategory } from "@/lib/api/xvm-api"

const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    sort_order: z.number().int().min(0).optional(),
    applies_to: z.enum(["revenue", "expense", "payout"]).nullable().optional(),
  })
  .strict()

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
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const categories = await listFinanceCategories(token, gate.xvmApiVenueId!)
      return NextResponse.json(categories)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createCategorySchema>
    try {
      data = createCategorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const category = await createFinanceCategory(token, gate.xvmApiVenueId!, data)
      return NextResponse.json(category, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 2: Write the update+delete route**

Create `apps/web/app/api/venues/[venueId]/finance-categories/[categoryId]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateFinanceCategory, deleteFinanceCategory } from "@/lib/api/xvm-api"

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    sort_order: z.number().int().min(0).optional(),
    applies_to: z.enum(["revenue", "expense", "payout"]).nullable().optional(),
  })
  .strict()

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

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum)) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateCategorySchema>
    try {
      data = updateCategorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const category = await updateFinanceCategory(token, gate.xvmApiVenueId!, categoryIdNum, data)
      return NextResponse.json(category)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum)) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteFinanceCategory(token, gate.xvmApiVenueId!, categoryIdNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/finance-categories
git commit -m "feat: add xvm-api-backed finance categories routes"
```

---

## Task 6: Finance categories UI

A small self-contained component, same pattern as `components/staff-visibility-settings.tsx` (own `venueId` prop, own fetch/save calls, not wired into the big settings-page save button or dirty-tracking — categories act immediately like a simple CRUD list, not a batched form).

**Files:**
- Create: `apps/web/components/finance-categories-settings.tsx`
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/components/finance-categories-settings.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface FinanceCategoriesSettingsProps {
  venueId: string
}

interface FinanceCategoryRow {
  id: number
  name: string
  sort_order: number
  applies_to: "revenue" | "expense" | "payout" | null
}

const APPLIES_TO_OPTIONS: { value: "revenue" | "expense" | "payout" | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
  { value: "payout", label: "Payout" },
]

export function FinanceCategoriesSettings({ venueId }: FinanceCategoriesSettingsProps) {
  const [categories, setCategories] = useState<FinanceCategoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newAppliesTo, setNewAppliesTo] = useState<"revenue" | "expense" | "payout" | "">("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/venues/${venueId}/finance-categories`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load categories"))))
      .then((data: FinanceCategoryRow[]) => {
        if (!cancelled) setCategories(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [venueId])

  async function handleAdd() {
    if (!newName.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/finance-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          applies_to: newAppliesTo || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to create category")
      }
      const created: FinanceCategoryRow = await res.json()
      setCategories((prev) => [...prev, created])
      setNewName("")
      setNewAppliesTo("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(categoryId: number) {
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/finance-categories/${categoryId}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to delete category")
      }
      setCategories((prev) => prev.filter((c) => c.id !== categoryId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category")
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading categories...</div>

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-destructive">{error}</div>}
      <ul className="space-y-1">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {category.name}
              {category.applies_to && <span className="text-muted-foreground"> ({category.applies_to})</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(category.id)}>
              Remove
            </Button>
          </li>
        ))}
        {categories.length === 0 && <li className="text-sm text-muted-foreground">No categories yet</li>}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          maxLength={50}
          className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none flex-1"
        />
        <select
          value={newAppliesTo}
          onChange={(e) => setNewAppliesTo(e.target.value as "revenue" | "expense" | "payout" | "")}
          className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
        >
          {APPLIES_TO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={isSaving || !newName.trim()} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the settings page**

Add the import near the top of `apps/web/app/dashboard/[slug]/settings/page.tsx`, alongside the other component imports (check the existing import block for `StaffVisibilitySettings` or similar and add next to it):

```typescript
import { FinanceCategoriesSettings } from "@/components/finance-categories-settings"
```

Then, immediately after the Pot Payroll section's closing `</div>` from Task 4 Step 5, add a new block (`venueId` is already in scope in this component — check the existing pot-settings fetch call in Step 1 of Task 4 for the exact variable name used there, `venue.id`/`venueId`, and match it):

```tsx
              {/* Finance Categories */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <div className="iinfo w-full">
                  <div className="iname">Finance Categories</div>
                  <div className="idesc">Group transactions for reporting — optional, sales work without one</div>
                </div>
                <div className="w-full">
                  <FinanceCategoriesSettings venueId={venueId} />
                </div>
              </div>
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS, same count as after Task 4

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/finance-categories-settings.tsx apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: add finance categories management UI to settings page"
```

---

## Task 7: Live verification

Static checks pass by this point, but per this repo's CLAUDE.md, that's not sufficient on its own — verify against the running local dev stack.

- [ ] **Step 1: Start the local stack**

Run: `docker compose -f docker-compose.local.yml up -d` (from repo root), then `cd apps/web && pnpm dev`

- [ ] **Step 2: Click through as a Manager on an xvm-api-connected venue**

- Open the venue's Settings page. Confirm the Pot Payroll section renders unconditionally (no toggle), with tax percent / include-sales / default-tip-pooled fields visible and prefilled from xvm-api.
- Change the tax percent, save, reload the page, confirm the value persisted (round-trips through basis points correctly — e.g. save 12.5%, reload, still reads 12.5%, not 12 or 13).
- In the new Finance Categories section: add a category with a name only (no `applies_to`), confirm it appears in the list. Add a second with `applies_to: revenue`, confirm the label shows. Remove one, confirm it disappears and a page reload doesn't bring it back.
- Confirm a venue with no `xvmApiVenueId` link gets the existing "not connected" 409 behavior on both endpoints (matches every other cut-over route).

- [ ] **Step 3: Report results**

If everything above works: done. If something doesn't match, fix it before considering this plan complete — don't leave a known-broken live behavior behind static checks passing.

---

## Self-Review Notes

- **Spec coverage:** settings GET/PUT (Task 3+4), categories list/create/update/delete (Task 5+6, though the UI only wires create/delete — `updateFinanceCategory` client function exists for a future edit-in-place feature but has no UI caller yet; this is intentional, not a gap, since nothing in scope needs it today), conversion helpers (Task 1), live verification (Task 7). Not in scope, deliberately: transactions, pot preview/generate/void, payroll CRUD — later plans per the original cutover-order recommendation.
- **`enabled` field:** confirmed dropped per explicit user decision, not silently assumed.
- **No Prisma fallback:** every new/modified route's only Prisma call is the `xvmApiVenueId` lookup gate, matching [[feedback_no_prisma_fallback_xvm_api_migration]] and the established playbook.
