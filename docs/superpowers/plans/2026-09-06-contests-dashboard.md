# Contests Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the manager-facing web dashboard for xvm-api's contests feature (giveaways + raffles) — a new Contests page under `apps/web`, its API client, Next.js proxy routes, and UI components, per the approved design in `docs/superpowers/specs/2026-09-06-contests-dashboard-design.md`.

**Architecture:** Three-layer convention already used by Rooms/Shifts/Tasks: server page → session-gated Next.js proxy route (holds the xvm-api `personToken`) → `lib/api/xvm-api.ts` client → xvm-api backend. Entrant display names are resolved server-side in the entries proxy routes by batching `discord_user_id` against the dashboard's own `User.discordId` (Prisma), falling back to the raw id.

**Tech Stack:** Next.js App Router, TypeScript (strict), Prisma, Zod, Vitest, shadcn/ui (Radix primitives already installed), Tailwind, sonner (toasts).

---

## Reference: xvm-api contract this plan implements against

Confirmed from `origin/dev` on xvm-api (`src/api/schemas/contests.py`, `src/api/routers/contests.py`), merged PR #84 + fixes:

- `discord_user_id` is a `Snowflake`, which xvm-api serializes as a **JSON string** — never treat it as a JS number.
- `EntryRow.quantity`: 1 for giveaways, ticket count for raffles. Not called `ticket_count` on the entry.
- Endpoints (all under `/venues/{venue_id}`):
  - `GET/POST /giveaways`, `GET/PATCH/DELETE /giveaways/{id}`, `GET /giveaways/{id}/entries`, `POST /giveaways/{id}/roll`
  - `GET/POST /raffles`, `GET/PATCH/DELETE /raffles/{id}`, `GET /raffles/{id}/entries`, `POST /raffles/{id}/roll`
  - `PUT /raffles/{id}/entries/{discord_user_id}` (credit tickets), `DELETE /raffles/{id}/entries/{discord_user_id}` (remove entrant entirely — API docstring: "Drop somebody out entirely", not a partial refund)
- Tiering: list/get/entries = any member; create/update/delete/roll = `MembershipTier.Manager`; raffle credit/refund = any member per the API, but this plan gates them to Manager+ in the UI per the approved design.
- Validation limits (from `src/api/constants.py`): name ≤ 100, description ≤ 1000, prize ≤ 500, emoji ≤ 100, `num_winners` 1–50, `cost_per_ticket` 1–999,999,999,999, `winner_basis_points` 0–10,000, ticket credit quantity 1–10,000.
- Per the approved design, giveaway entries are view-only in the dashboard (no manual add/remove) — only raffles get credit/refund actions. Scope is deliberately not expanded beyond what was approved.

---

## Task 1: Add the `Sheet` UI primitive

No slide-over primitive exists yet (`components/ui` has `Dialog`/`AlertDialog` only). This is shadcn's standard `Sheet`, built on the already-installed `@radix-ui/react-dialog` + `class-variance-authority` — no new npm dependency.

**Files:**
- Create: `apps/web/components/ui/sheet.tsx`

- [ ] **Step 1: Write the primitive**

```tsx
"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

const sheetVariants = cva(
  "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 border shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        right:
          "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-full border-l sm:max-w-lg",
        left:
          "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-full border-r sm:max-w-lg",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & { showCloseButton?: boolean }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content data-slot="sheet-content" className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-6", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-foreground font-semibold", className)} {...props} />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors from `components/ui/sheet.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/sheet.tsx
git commit -m "feat: add Sheet slide-over UI primitive"
```

---

## Task 2: Add contest type badge variants

**Files:**
- Modify: `apps/web/components/ui/badge.tsx:16-21`

- [ ] **Step 1: Add two variants to `badgeVariants`**

In `apps/web/components/ui/badge.tsx`, add these two lines inside the `variants.variant` object, right after the existing `live:` line (line 21):

```ts
        "type-giveaway": "border-[var(--blue-018)] bg-[var(--blue-010)] text-[var(--xiv-blue)]",
        "type-raffle": "border-[rgba(249,226,175,0.20)] bg-[rgba(249,226,175,0.10)] text-[var(--warning)]",
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/badge.tsx
git commit -m "feat: add giveaway/raffle badge variants"
```

---

## Task 3: xvm-api client — Giveaways

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (append new section at end of file, after `// ── Tasks API ──` section, currently ending at line 1253)
- Test: `apps/web/lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/lib/api/xvm-api.test.ts` (add these imports to the existing top-of-file import list from `"./xvm-api"`, alongside `listTasks` etc.):

```ts
  listGiveaways,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  listGiveawayEntries,
  rollGiveaway,
  type GiveawayRow,
```

Then append this new `describe` block at the end of the file:

```ts
describe("Giveaways API", () => {
  const sampleGiveaway: GiveawayRow = {
    id: 1,
    name: "Weekend VIP Pass",
    description: null,
    prize: "1x VIP Pass",
    thumbnail_url: null,
    color: null,
    emoji: null,
    end_at: null,
    num_winners: 1,
    auto_notify: true,
    entry_count: 0,
    rolled_at: null,
    rolled_by_person_id: null,
    created_at: "2026-09-06T00:00:00Z",
  }

  it("listGiveaways GETs the venue's giveaways", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleGiveaway] })
    const result = await listGiveaways("token", "venue-1")
    expect(result).toEqual([sampleGiveaway])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/giveaways")
  })

  it("listGiveaways forwards includeRolled and limit as query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listGiveaways("token", "venue-1", { includeRolled: true, limit: 10 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("include_rolled=true")
    expect(url).toContain("limit=10")
  })

  it("createGiveaway POSTs to /venues/{venueId}/giveaways", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleGiveaway })
    const result = await createGiveaway("token", "venue-1", { name: "Weekend VIP Pass", prize: "1x VIP Pass" })
    expect(result).toEqual(sampleGiveaway)
  })

  it("updateGiveaway PATCHes /giveaways/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleGiveaway })
    const result = await updateGiveaway("token", "venue-1", 1, { name: "Updated" })
    expect(result).toEqual(sampleGiveaway)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1")
    expect(options.method).toBe("PATCH")
  })

  it("deleteGiveaway DELETEs /giveaways/{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteGiveaway("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1")
    expect(options.method).toBe("DELETE")
  })

  it("listGiveawayEntries GETs /giveaways/{id}/entries", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listGiveawayEntries("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1/entries")
  })

  it("rollGiveaway POSTs /giveaways/{id}/roll", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { winners: [{ discord_user_id: "123", winner_rank: 1 }] } })
    const result = await rollGiveaway("token", "venue-1", 1)
    expect(result.winners).toHaveLength(1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1/roll")
    expect(options.method).toBe("POST")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run lib/api/xvm-api.test.ts -t "Giveaways API"`
Expected: FAIL — `listGiveaways` (and siblings) is not exported from `./xvm-api`

- [ ] **Step 3: Implement**

Append to the end of `apps/web/lib/api/xvm-api.ts` (after the `getShiftAudit`/Tasks section, i.e. after line 1253):

```ts
// ── Contests API ───────────────────────────────────────────────
//
// discord_user_id is xvm-api's Snowflake type, serialized as a JSON string -
// never parse it to a JS number, real Discord ids exceed Number.MAX_SAFE_INTEGER.

export interface GiveawayRow {
  id: number
  name: string | null
  description: string | null
  prize: string | null
  thumbnail_url: string | null
  color: number | null
  emoji: string | null
  end_at: string | null
  num_winners: number
  auto_notify: boolean
  entry_count: number
  rolled_at: string | null
  rolled_by_person_id: number | null
  created_at: string
}

export interface GiveawayCreate {
  name?: string | null
  description?: string | null
  prize?: string | null
  thumbnail_url?: string | null
  color?: number | null
  emoji?: string | null
  end_at?: string | null
  num_winners?: number
  auto_notify?: boolean
}

export interface GiveawayUpdate {
  name?: string | null
  description?: string | null
  prize?: string | null
  thumbnail_url?: string | null
  color?: number | null
  emoji?: string | null
  end_at?: string | null
  num_winners?: number | null
  auto_notify?: boolean | null
}

export interface EntryRow {
  discord_user_id: string
  quantity: number
  entered_at: string
  won_at: string | null
  winner_rank: number | null
}

export interface Winner {
  discord_user_id: string
  winner_rank: number
}

export interface GiveawayRoll {
  winners: Winner[]
}

export async function listGiveaways(
  personToken: string,
  venueId: string,
  options: { includeRolled?: boolean; limit?: number } = {}
): Promise<GiveawayRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeRolled) params.set("include_rolled", "true")
  if (options.limit !== undefined) params.set("limit", String(options.limit))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<GiveawayRow[]>(`/venues/${venueId}/giveaways${query}`, {}, personToken)
}

export async function createGiveaway(personToken: string, venueId: string, data: GiveawayCreate): Promise<GiveawayRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRow>(`/venues/${venueId}/giveaways`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateGiveaway(
  personToken: string,
  venueId: string,
  giveawayId: number,
  data: GiveawayUpdate
): Promise<GiveawayRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRow>(
    `/venues/${venueId}/giveaways/${giveawayId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteGiveaway(personToken: string, venueId: string, giveawayId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/giveaways/${giveawayId}`, { method: "DELETE" }, personToken)
}

export async function listGiveawayEntries(personToken: string, venueId: string, giveawayId: number): Promise<EntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow[]>(`/venues/${venueId}/giveaways/${giveawayId}/entries`, {}, personToken)
}

export async function rollGiveaway(personToken: string, venueId: string, giveawayId: number): Promise<GiveawayRoll> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<GiveawayRoll>(`/venues/${venueId}/giveaways/${giveawayId}/roll`, { method: "POST" }, personToken)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/api/xvm-api.test.ts -t "Giveaways API"`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api.test.ts
git commit -m "feat: add giveaways xvm-api client functions"
```

---

## Task 4: xvm-api client — Raffles

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (append after the Giveaways section added in Task 3)
- Test: `apps/web/lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the import list at the top of `xvm-api.test.ts`:

```ts
  listRaffles,
  createRaffle,
  updateRaffle,
  deleteRaffle,
  listRaffleEntries,
  creditTickets,
  refundTickets,
  rollRaffle,
  type RaffleRow,
```

Append this `describe` block at the end of the file:

```ts
describe("Raffles API", () => {
  const sampleRaffle: RaffleRow = {
    id: 1,
    name: "Anniversary Draw",
    cost_per_ticket: 100_000,
    winner_basis_points: 5_000,
    num_winners: 1,
    auto_notify: true,
    entry_count: 0,
    ticket_count: 0,
    pot: 0,
    rolled_at: null,
    rolled_by_person_id: null,
    created_at: "2026-09-06T00:00:00Z",
  }

  it("listRaffles GETs the venue's raffles", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleRaffle] })
    const result = await listRaffles("token", "venue-1")
    expect(result).toEqual([sampleRaffle])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/raffles")
  })

  it("createRaffle POSTs to /venues/{venueId}/raffles", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleRaffle })
    const result = await createRaffle("token", "venue-1", { name: "Anniversary Draw" })
    expect(result).toEqual(sampleRaffle)
  })

  it("updateRaffle PATCHes /raffles/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleRaffle })
    const result = await updateRaffle("token", "venue-1", 1, { name: "Updated" })
    expect(result).toEqual(sampleRaffle)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1")
    expect(options.method).toBe("PATCH")
  })

  it("deleteRaffle DELETEs /raffles/{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteRaffle("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1")
    expect(options.method).toBe("DELETE")
  })

  it("listRaffleEntries GETs /raffles/{id}/entries", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listRaffleEntries("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries")
  })

  it("creditTickets PUTs /raffles/{id}/entries/{discordUserId}", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: { discord_user_id: "555", quantity: 3, entered_at: "2026-09-06T00:00:00Z", won_at: null, winner_rank: null },
    })
    await creditTickets("token", "venue-1", 1, "555", { quantity: 3 })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries/555")
    expect(options.method).toBe("PUT")
    expect(JSON.parse(options.body)).toEqual({ quantity: 3 })
  })

  it("refundTickets DELETEs /raffles/{id}/entries/{discordUserId}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await refundTickets("token", "venue-1", 1, "555")
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries/555")
    expect(options.method).toBe("DELETE")
  })

  it("rollRaffle POSTs /raffles/{id}/roll", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: { winners: [{ discord_user_id: "555", winner_rank: 1 }], ticket_count: 10, pot: 1_000_000, winners_take: 500_000, venue_take: 500_000 },
    })
    const result = await rollRaffle("token", "venue-1", 1)
    expect(result.pot).toBe(1_000_000)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/roll")
    expect(options.method).toBe("POST")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run lib/api/xvm-api.test.ts -t "Raffles API"`
Expected: FAIL — `listRaffles` (and siblings) is not exported from `./xvm-api`

- [ ] **Step 3: Implement**

Append to the end of `apps/web/lib/api/xvm-api.ts`, right after the Task 3 additions:

```ts
export interface RaffleRow {
  id: number
  name: string | null
  cost_per_ticket: number
  winner_basis_points: number
  num_winners: number
  auto_notify: boolean
  entry_count: number
  ticket_count: number
  pot: number
  rolled_at: string | null
  rolled_by_person_id: number | null
  created_at: string
}

export interface RaffleCreate {
  name?: string | null
  cost_per_ticket?: number
  winner_basis_points?: number
  num_winners?: number
  auto_notify?: boolean
}

export interface RaffleUpdate {
  name?: string | null
  cost_per_ticket?: number | null
  winner_basis_points?: number | null
  num_winners?: number | null
  auto_notify?: boolean | null
}

export interface TicketCredit {
  quantity?: number
}

export interface RaffleRoll {
  winners: Winner[]
  ticket_count: number
  pot: number
  winners_take: number
  venue_take: number
}

export async function listRaffles(
  personToken: string,
  venueId: string,
  options: { includeRolled?: boolean; limit?: number } = {}
): Promise<RaffleRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeRolled) params.set("include_rolled", "true")
  if (options.limit !== undefined) params.set("limit", String(options.limit))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<RaffleRow[]>(`/venues/${venueId}/raffles${query}`, {}, personToken)
}

export async function createRaffle(personToken: string, venueId: string, data: RaffleCreate): Promise<RaffleRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRow>(`/venues/${venueId}/raffles`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateRaffle(
  personToken: string,
  venueId: string,
  raffleId: number,
  data: RaffleUpdate
): Promise<RaffleRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRow>(
    `/venues/${venueId}/raffles/${raffleId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteRaffle(personToken: string, venueId: string, raffleId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/raffles/${raffleId}`, { method: "DELETE" }, personToken)
}

export async function listRaffleEntries(personToken: string, venueId: string, raffleId: number): Promise<EntryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow[]>(`/venues/${venueId}/raffles/${raffleId}/entries`, {}, personToken)
}

export async function creditTickets(
  personToken: string,
  venueId: string,
  raffleId: number,
  discordUserId: string,
  data: TicketCredit
): Promise<EntryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EntryRow>(
    `/venues/${venueId}/raffles/${raffleId}/entries/${discordUserId}`,
    { method: "PUT", body: JSON.stringify(data) },
    personToken
  )
}

export async function refundTickets(
  personToken: string,
  venueId: string,
  raffleId: number,
  discordUserId: string
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/raffles/${raffleId}/entries/${discordUserId}`,
    { method: "DELETE" },
    personToken
  )
}

export async function rollRaffle(personToken: string, venueId: string, raffleId: number): Promise<RaffleRoll> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RaffleRoll>(`/venues/${venueId}/raffles/${raffleId}/roll`, { method: "POST" }, personToken)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/api/xvm-api.test.ts -t "Raffles API"`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full xvm-api test file to confirm nothing else broke**

Run: `cd apps/web && npx vitest run lib/api/xvm-api.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api.test.ts
git commit -m "feat: add raffles xvm-api client functions"
```

---

## Task 5: Shared entrant-name resolution helper

Batches `discord_user_id`s from an entries list against the dashboard's own `User.discordId` table in one query. Used by both entries proxy routes (Task 7, Task 10).

**Files:**
- Create: `apps/web/lib/api/resolve-entry-names.ts`

- [ ] **Step 1: Write the helper**

```ts
import { prisma } from "@/lib/prisma"
import type { EntryRow } from "@/lib/api/xvm-api"

export interface ResolvedEntry extends EntryRow {
  display_name: string | null
}

/**
 * discord_user_id entries carry no username - resolve against linked accounts
 * (User.discordId) in one batched query, falling back to null (the caller
 * renders a truncated id) for anyone who hasn't linked their Discord account.
 */
export async function resolveEntryNames(entries: EntryRow[]): Promise<ResolvedEntry[]> {
  if (entries.length === 0) return []
  const discordIds = entries.map((e) => e.discord_user_id)
  const users = await prisma.user.findMany({
    where: { discordId: { in: discordIds } },
    select: { discordId: true, displayName: true, name: true },
  })
  const nameByDiscordId = new Map(users.map((u) => [u.discordId as string, u.displayName ?? u.name ?? null]))
  return entries.map((e) => ({ ...e, display_name: nameByDiscordId.get(e.discord_user_id) ?? null }))
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/resolve-entry-names.ts
git commit -m "feat: add entrant display-name resolution helper"
```

---

## Task 6: Proxy routes — giveaways collection (list, create)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/contests/giveaways/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listGiveaways, createGiveaway } from "@/lib/api/xvm-api"

const createGiveawaySchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  prize: z.string().trim().max(500).nullable().optional(),
  thumbnailUrl: z.string().trim().nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  emoji: z.string().trim().max(100).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  numWinners: z.number().int().min(1).max(50).optional(),
  autoNotify: z.boolean().optional(),
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
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

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

    const includeRolled = new URL(request.url).searchParams.get("include_rolled") === "true"

    try {
      const giveaways = await listGiveaways(token, gate.xvmApiVenueId!, { includeRolled })
      return NextResponse.json(giveaways)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

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

    let parsed: z.infer<typeof createGiveawaySchema>
    try {
      parsed = createGiveawaySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const giveaway = await createGiveaway(token, gate.xvmApiVenueId!, {
        name: parsed.name,
        description: parsed.description,
        prize: parsed.prize,
        thumbnail_url: parsed.thumbnailUrl,
        color: parsed.color,
        emoji: parsed.emoji,
        end_at: parsed.endAt,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(giveaway)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/contests/giveaways/route.ts
git commit -m "feat: add giveaways list/create proxy route"
```

---

## Task 7: Proxy routes — giveaway detail, entries, roll

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/entries/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/roll/route.ts`

- [ ] **Step 1: Write the detail route (PATCH, DELETE)**

`apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateGiveaway, deleteGiveaway } from "@/lib/api/xvm-api"

const updateGiveawaySchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  prize: z.string().trim().max(500).nullable().optional(),
  thumbnailUrl: z.string().trim().nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  emoji: z.string().trim().max(100).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  numWinners: z.number().int().min(1).max(50).nullable().optional(),
  autoNotify: z.boolean().nullable().optional(),
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

function parseGiveawayId(giveawayId: string) {
  const id = Number(giveawayId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, giveawayId } = await context.params
    const id = parseGiveawayId(giveawayId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid giveaway id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let parsed: z.infer<typeof updateGiveawaySchema>
    try {
      parsed = updateGiveawaySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const giveaway = await updateGiveaway(token, gate.xvmApiVenueId!, id, {
        name: parsed.name,
        description: parsed.description,
        prize: parsed.prize,
        thumbnail_url: parsed.thumbnailUrl,
        color: parsed.color,
        emoji: parsed.emoji,
        end_at: parsed.endAt,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(giveaway)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, giveawayId } = await context.params
    const id = parseGiveawayId(giveawayId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid giveaway id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteGiveaway(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Write the entries route (GET, with name resolution)**

`apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/entries/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listGiveawayEntries } from "@/lib/api/xvm-api"
import { resolveEntryNames } from "@/lib/api/resolve-entry-names"

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

function parseGiveawayId(giveawayId: string) {
  const id = Number(giveawayId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, giveawayId } = await context.params
    const id = parseGiveawayId(giveawayId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid giveaway id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const entries = await listGiveawayEntries(token, gate.xvmApiVenueId!, id)
      const resolved = await resolveEntryNames(entries)
      return NextResponse.json(resolved)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id/entries] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
```

- [ ] **Step 3: Write the roll route (POST)**

`apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]/roll/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { rollGiveaway } from "@/lib/api/xvm-api"

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

function parseGiveawayId(giveawayId: string) {
  const id = Number(giveawayId)
  return Number.isInteger(id) ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; giveawayId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, giveawayId } = await context.params
    const id = parseGiveawayId(giveawayId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid giveaway id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const result = await rollGiveaway(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(result)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/giveaways/:id/roll] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/contests/giveaways/[giveawayId]
git commit -m "feat: add giveaway detail, entries, and roll proxy routes"
```

---

## Task 8: Proxy routes — raffles collection (list, create)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/contests/raffles/route.ts`

- [ ] **Step 1: Write the route**

Same shape as Task 6, swapping giveaway fields for raffle fields:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listRaffles, createRaffle } from "@/lib/api/xvm-api"

const createRaffleSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  costPerTicket: z.number().int().min(1).max(999_999_999_999).optional(),
  winnerBasisPoints: z.number().int().min(0).max(10_000).optional(),
  numWinners: z.number().int().min(1).max(50).optional(),
  autoNotify: z.boolean().optional(),
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
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

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

    const includeRolled = new URL(request.url).searchParams.get("include_rolled") === "true"

    try {
      const raffles = await listRaffles(token, gate.xvmApiVenueId!, { includeRolled })
      return NextResponse.json(raffles)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

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

    let parsed: z.infer<typeof createRaffleSchema>
    try {
      parsed = createRaffleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const raffle = await createRaffle(token, gate.xvmApiVenueId!, {
        name: parsed.name,
        cost_per_ticket: parsed.costPerTicket,
        winner_basis_points: parsed.winnerBasisPoints,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(raffle)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/contests/raffles/route.ts
git commit -m "feat: add raffles list/create proxy route"
```

---

## Task 9: Proxy routes — raffle detail, roll

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/roll/route.ts`

- [ ] **Step 1: Write the detail route (PATCH, DELETE)**

`apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateRaffle, deleteRaffle } from "@/lib/api/xvm-api"

const updateRaffleSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  costPerTicket: z.number().int().min(1).max(999_999_999_999).nullable().optional(),
  winnerBasisPoints: z.number().int().min(0).max(10_000).nullable().optional(),
  numWinners: z.number().int().min(1).max(50).nullable().optional(),
  autoNotify: z.boolean().nullable().optional(),
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

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let parsed: z.infer<typeof updateRaffleSchema>
    try {
      parsed = updateRaffleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const raffle = await updateRaffle(token, gate.xvmApiVenueId!, id, {
        name: parsed.name,
        cost_per_ticket: parsed.costPerTicket,
        winner_basis_points: parsed.winnerBasisPoints,
        num_winners: parsed.numWinners,
        auto_notify: parsed.autoNotify,
      })
      return NextResponse.json(raffle)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteRaffle(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Write the roll route (POST)**

`apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/roll/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { rollRaffle } from "@/lib/api/xvm-api"

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

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const result = await rollRaffle(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(result)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/roll] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/route.ts apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/roll/route.ts
git commit -m "feat: add raffle detail and roll proxy routes"
```

---

## Task 10: Proxy routes — raffle entries, credit, refund

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/entries/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/entries/[discordUserId]/route.ts`

- [ ] **Step 1: Write the entries route (GET, with name resolution)**

`apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/entries/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listRaffleEntries } from "@/lib/api/xvm-api"
import { resolveEntryNames } from "@/lib/api/resolve-entry-names"

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

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const entries = await listRaffleEntries(token, gate.xvmApiVenueId!, id)
      const resolved = await resolveEntryNames(entries)
      return NextResponse.json(resolved)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)
```

- [ ] **Step 2: Write the credit/refund route (PUT, DELETE)**

`apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/entries/[discordUserId]/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { creditTickets, refundTickets } from "@/lib/api/xvm-api"

const creditSchema = z.object({
  quantity: z.number().int().min(1).max(10_000).optional(),
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

function parseRaffleId(raffleId: string) {
  const id = Number(raffleId)
  return Number.isInteger(id) ? id : null
}

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string; discordUserId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId, discordUserId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let parsed: z.infer<typeof creditSchema>
    try {
      parsed = creditSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const entry = await creditTickets(token, gate.xvmApiVenueId!, id, discordUserId, { quantity: parsed.quantity })
      return NextResponse.json(entry)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries/:discordUserId] PUT error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; raffleId: string; discordUserId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, raffleId, discordUserId } = await context.params
    const id = parseRaffleId(raffleId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid raffle id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await refundTickets(token, gate.xvmApiVenueId!, id, discordUserId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[contests/raffles/:id/entries/:discordUserId] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/contests/raffles/[raffleId]/entries
git commit -m "feat: add raffle entries, credit, and refund proxy routes"
```

---

## Task 11: `ContestFormDialog` component (create/edit)

**Files:**
- Create: `apps/web/components/contest-form-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { GiveawayRow, RaffleRow } from "@/lib/api/xvm-api"

type ContestType = "giveaway" | "raffle"

interface ContestFormDialogProps {
  venueId: string
  trigger?: React.ReactNode
  onCreated: (type: ContestType, contest: GiveawayRow | RaffleRow) => void
}

export function ContestFormDialog({ venueId, trigger, onCreated }: ContestFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [type, setType] = useState<ContestType>("giveaway")

  const [name, setName] = useState("")
  const [prize, setPrize] = useState("")
  const [description, setDescription] = useState("")
  const [costPerTicket, setCostPerTicket] = useState("100000")
  const [winnerBasisPoints, setWinnerBasisPoints] = useState("5000")
  const [numWinners, setNumWinners] = useState("1")
  const [endAt, setEndAt] = useState<Date | undefined>(undefined)
  const [autoNotify, setAutoNotify] = useState(true)

  function reset() {
    setType("giveaway")
    setName("")
    setPrize("")
    setDescription("")
    setCostPerTicket("100000")
    setWinnerBasisPoints("5000")
    setNumWinners("1")
    setEndAt(undefined)
    setAutoNotify(true)
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error("Please enter a name")
      return
    }
    const winners = Number(numWinners)
    if (!Number.isInteger(winners) || winners < 1 || winners > 50) {
      toast.error("Number of winners must be between 1 and 50")
      return
    }

    setSubmitting(true)
    try {
      if (type === "giveaway") {
        const giveaway = await apiFetch<GiveawayRow>(`/api/venues/${venueId}/contests/giveaways`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            prize: prize.trim() || null,
            description: description.trim() || null,
            numWinners: winners,
            endAt: endAt ? endAt.toISOString() : null,
            autoNotify,
          }),
        })
        onCreated("giveaway", giveaway)
      } else {
        const cost = Number(costPerTicket)
        const basisPoints = Number(winnerBasisPoints)
        if (!Number.isInteger(cost) || cost < 1) {
          toast.error("Cost per ticket must be a positive number")
          setSubmitting(false)
          return
        }
        if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
          toast.error("Winner share must be between 0 and 10000 basis points")
          setSubmitting(false)
          return
        }
        const raffle = await apiFetch<RaffleRow>(`/api/venues/${venueId}/contests/raffles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            costPerTicket: cost,
            winnerBasisPoints: basisPoints,
            numWinners: winners,
            autoNotify,
          }),
        })
        onCreated("raffle", raffle)
      }
      toast.success(`${type === "giveaway" ? "Giveaway" : "Raffle"} created`)
      reset()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to create contest. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>New Contest</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Contest</DialogTitle>
          <DialogDescription>Give away a prize, or run a ticketed raffle for a gil pot.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              <Button type="button" variant={type === "giveaway" ? "default" : "outline"} size="sm" onClick={() => setType("giveaway")}>
                Giveaway
              </Button>
              <Button type="button" variant={type === "raffle" ? "default" : "outline"} size="sm" onClick={() => setType("raffle")}>
                Raffle
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contest-name">Name</Label>
            <Input id="contest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>

          {type === "giveaway" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="contest-prize">Prize</Label>
                <Input id="contest-prize" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contest-description">Description</Label>
                <Textarea
                  id="contest-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contest-cost">Cost per ticket (gil)</Label>
                <Input
                  id="contest-cost"
                  type="number"
                  min={1}
                  value={costPerTicket}
                  onChange={(e) => setCostPerTicket(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contest-basis-points">Winner share (basis points, 5000 = 50%)</Label>
                <Input
                  id="contest-basis-points"
                  type="number"
                  min={0}
                  max={10_000}
                  value={winnerBasisPoints}
                  onChange={(e) => setWinnerBasisPoints(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="contest-winners">Number of winners</Label>
            <Input
              id="contest-winners"
              type="number"
              min={1}
              max={50}
              value={numWinners}
              onChange={(e) => setNumWinners(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ends at (optional)</Label>
            <DateTimePicker date={endAt} onDateChange={setEndAt} placeholder="No end date" />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="contest-auto-notify">Auto-notify winners in Discord</Label>
            <Switch id="contest-auto-notify" checked={autoNotify} onCheckedChange={setAutoNotify} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contest-form-dialog.tsx
git commit -m "feat: add ContestFormDialog create component"
```

---

## Task 12: `ContestEntriesDrawer` component

**Files:**
- Create: `apps/web/components/contest-entries-drawer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"

interface ResolvedEntry {
  discord_user_id: string
  quantity: number
  entered_at: string
  won_at: string | null
  winner_rank: number | null
  display_name: string | null
}

interface ContestEntriesDrawerProps {
  venueId: string
  contestType: "giveaway" | "raffle"
  contestId: number | null
  contestName: string
  rolled: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

function entrantLabel(entry: ResolvedEntry): string {
  if (entry.display_name) return entry.display_name
  return `${entry.discord_user_id.slice(0, 4)}...${entry.discord_user_id.slice(-4)}`
}

function entriesPath(venueId: string, contestType: "giveaway" | "raffle", contestId: number): string {
  return contestType === "giveaway"
    ? `/api/venues/${venueId}/contests/giveaways/${contestId}/entries`
    : `/api/venues/${venueId}/contests/raffles/${contestId}/entries`
}

export function ContestEntriesDrawer({
  venueId,
  contestType,
  contestId,
  contestName,
  rolled,
  canManage,
  onOpenChange,
}: ContestEntriesDrawerProps) {
  const [entries, setEntries] = useState<ResolvedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creditTarget, setCreditTarget] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState("1")

  useEffect(() => {
    if (contestId === null) return
    setLoading(true)
    apiFetch<ResolvedEntry[]>(entriesPath(venueId, contestType, contestId))
      .then(setEntries)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Failed to load entries."))
      .finally(() => setLoading(false))
  }, [venueId, contestType, contestId])

  async function submitCredit(discordUserId: string) {
    if (contestId === null) return
    const quantity = Number(creditAmount)
    if (!Number.isInteger(quantity) || quantity < 1) {
      toast.error("Quantity must be a positive whole number")
      return
    }
    try {
      const updated = await apiFetch<ResolvedEntry>(
        `/api/venues/${venueId}/contests/raffles/${contestId}/entries/${discordUserId}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) }
      )
      setEntries((prev) => prev.map((e) => (e.discord_user_id === discordUserId ? { ...e, ...updated } : e)))
      toast.success(`Credited ${quantity} ticket(s)`)
      setCreditTarget(null)
      setCreditAmount("1")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to credit tickets.")
    }
  }

  async function removeEntry(discordUserId: string) {
    if (contestId === null) return
    try {
      await apiFetch(`/api/venues/${venueId}/contests/raffles/${contestId}/entries/${discordUserId}`, {
        method: "DELETE",
      })
      setEntries((prev) => prev.filter((e) => e.discord_user_id !== discordUserId))
      toast.success("Entry removed")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove entry.")
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const rankA = a.winner_rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.winner_rank ?? Number.MAX_SAFE_INTEGER
    return rankA - rankB
  })

  return (
    <Sheet open={contestId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contestName}</SheetTitle>
          <SheetDescription>{entries.length} entrant(s)</SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading entries...</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrant</TableHead>
                  {contestType === "raffle" && <TableHead>Tickets</TableHead>}
                  <TableHead>Rank</TableHead>
                  {canManage && contestType === "raffle" && !rolled && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((entry) => (
                  <TableRow key={entry.discord_user_id}>
                    <TableCell className="flex items-center gap-1.5">
                      {entrantLabel(entry)}
                      {!entry.display_name && (
                        <button
                          type="button"
                          title="Copy Discord ID"
                          onClick={() => {
                            navigator.clipboard.writeText(entry.discord_user_id)
                            toast.success("Discord ID copied")
                          }}
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </TableCell>
                    {contestType === "raffle" && <TableCell>{entry.quantity}</TableCell>}
                    <TableCell>{entry.winner_rank ?? "—"}</TableCell>
                    {canManage && contestType === "raffle" && !rolled && (
                      <TableCell>
                        {creditTarget === entry.discord_user_id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              value={creditAmount}
                              onChange={(e) => setCreditAmount(e.target.value)}
                              className="h-7 w-16"
                            />
                            <Button size="sm" variant="outline" onClick={() => submitCredit(entry.discord_user_id)}>
                              Add
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCreditTarget(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setCreditTarget(entry.discord_user_id)}>
                              Credit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => removeEntry(entry.discord_user_id)}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contest-entries-drawer.tsx
git commit -m "feat: add ContestEntriesDrawer component"
```

---

## Task 13: `ContestsBoard` component (list + roll)

**Files:**
- Create: `apps/web/components/contests-board.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ContestFormDialog } from "@/components/contest-form-dialog"
import { ContestEntriesDrawer } from "@/components/contest-entries-drawer"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { GiveawayRow, RaffleRow, GiveawayRoll, RaffleRoll } from "@/lib/api/xvm-api"

type Contest = ({ kind: "giveaway" } & GiveawayRow) | ({ kind: "raffle" } & RaffleRow)

export interface ContestsBoardProps {
  venueId: string
  canManage: boolean
  giveaways: GiveawayRow[]
  raffles: RaffleRow[]
  notConnected?: boolean
}

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."

function winnerNames(winners: { discord_user_id: string }[]): string {
  return winners.map((w) => `${w.discord_user_id.slice(0, 4)}...${w.discord_user_id.slice(-4)}`).join(", ")
}

function rollPath(venueId: string, kind: "giveaway" | "raffle", id: number): string {
  return kind === "giveaway"
    ? `/api/venues/${venueId}/contests/giveaways/${id}/roll`
    : `/api/venues/${venueId}/contests/raffles/${id}/roll`
}

export function ContestsBoard({ venueId, canManage, giveaways, raffles, notConnected }: ContestsBoardProps) {
  const [contests, setContests] = useState<Contest[]>([
    ...giveaways.map((g) => ({ kind: "giveaway" as const, ...g })),
    ...raffles.map((r) => ({ kind: "raffle" as const, ...r })),
  ])
  const [rollTarget, setRollTarget] = useState<Contest | null>(null)
  const [rolling, setRolling] = useState(false)
  const [openEntries, setOpenEntries] = useState<Contest | null>(null)
  const [rolledWinners, setRolledWinners] = useState<Record<string, string>>({})

  function contestKey(c: Contest): string {
    return `${c.kind}:${c.id}`
  }

  function handleCreated(kind: "giveaway" | "raffle", contest: GiveawayRow | RaffleRow) {
    setContests((prev) => [{ kind, ...contest } as Contest, ...prev])
  }

  async function confirmRoll() {
    if (!rollTarget) return
    setRolling(true)
    try {
      const result = await apiFetch<GiveawayRoll | RaffleRoll>(rollPath(venueId, rollTarget.kind, rollTarget.id), {
        method: "POST",
      })
      const names = winnerNames(result.winners)
      setRolledWinners((prev) => ({ ...prev, [contestKey(rollTarget)]: names }))
      setContests((prev) =>
        prev.map((c) => (contestKey(c) === contestKey(rollTarget) ? { ...c, rolled_at: new Date().toISOString() } : c))
      )
      toast.success(`Winner${result.winners.length > 1 ? "s" : ""} rolled: ${names}`)
      setRollTarget(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("This draw was already rolled by someone else.")
        setContests((prev) =>
          prev.map((c) => (contestKey(c) === contestKey(rollTarget) ? { ...c, rolled_at: new Date().toISOString() } : c))
        )
      } else {
        toast.error(e instanceof ApiError ? e.message : "Failed to roll winner.")
      }
    } finally {
      setRolling(false)
      setRollTarget(null)
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4">
          <ContestFormDialog venueId={venueId} onCreated={handleCreated} />
        </div>
      )}

      {contests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contests yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contests.map((c) => {
            const isRolled = c.rolled_at !== null
            const entryCount = c.entry_count
            return (
              <Card key={contestKey(c)} className="cursor-pointer" onClick={() => setOpenEntries(c)}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <Badge variant={c.kind === "giveaway" ? "type-giveaway" : "type-raffle"}>
                    {c.kind === "giveaway" ? "Giveaway" : "Raffle"}
                  </Badge>
                  <Badge variant={isRolled ? "tag" : "status-open"}>{isRolled ? "Rolled" : "Open"}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">{c.name ?? `#${c.id}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.kind === "giveaway"
                      ? c.prize ?? "No prize set"
                      : `${(c.pot / 1_000_000).toFixed(2)}M gil pot · ${(c.cost_per_ticket / 1000).toFixed(0)}k/ticket`}
                    {" · "}
                    {entryCount} entries
                  </p>
                  {isRolled && rolledWinners[contestKey(c)] && (
                    <p className="text-sm mt-2 text-[var(--xiv-blue)]">Winner: {rolledWinners[contestKey(c)]}</p>
                  )}
                  {canManage && !isRolled && (
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRollTarget(c)
                      }}
                    >
                      Roll
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!rollTarget} onOpenChange={(open) => !open && setRollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Roll {rollTarget?.num_winners ?? 1} winner{(rollTarget?.num_winners ?? 1) > 1 ? "s" : ""} from{" "}
              {rollTarget?.entry_count ?? 0} entries?
            </AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rolling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoll} disabled={rolling}>
              {rolling ? "Rolling..." : "Roll"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContestEntriesDrawer
        venueId={venueId}
        contestType={openEntries?.kind ?? "giveaway"}
        contestId={openEntries?.id ?? null}
        contestName={openEntries?.name ?? ""}
        rolled={openEntries?.rolled_at !== null && openEntries?.rolled_at !== undefined}
        canManage={canManage}
        onOpenChange={(open) => !open && setOpenEntries(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contests-board.tsx
git commit -m "feat: add ContestsBoard list component"
```

---

## Task 14: Contests page (server component)

**Files:**
- Create: `apps/web/app/dashboard/[slug]/services/contests/page.tsx`

- [ ] **Step 1: Write the page**

Mirrors `app/dashboard/[slug]/rooms/page.tsx` exactly in structure:

```tsx
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { ContestsBoard } from "@/components/contests-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listGiveaways, listRaffles, type GiveawayRow, type RaffleRow } from "@/lib/api/xvm-api"

export default async function ContestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role

  let giveaways: GiveawayRow[] = []
  let raffles: RaffleRow[] = []
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      ;[giveaways, raffles] = await Promise.all([
        listGiveaways(token, venue.xvmApiVenueId),
        listRaffles(token, venue.xvmApiVenueId),
      ])
    } catch (err) {
      console.error("[contests page] list error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Contests</h1>
        </div>

        <ContestsBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          giveaways={giveaways}
          raffles={raffles}
          notConnected={notConnected}
        />
      </div>
    </VenueLayout>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/services/contests/page.tsx"
git commit -m "feat: add contests dashboard page"
```

---

## Task 15: Sidebar entry

**Files:**
- Modify: `apps/web/components/venue-sidebar.tsx:12-32` (icon import), `apps/web/components/venue-sidebar.tsx:263` (nav item)

- [ ] **Step 1: Add the `Gift` icon to the lucide-react import**

In the icon import block (currently lines 12-32), add `Gift` right after `ShoppingBag,` (line 21):

```ts
  ShoppingBag,
  Gift,
```

- [ ] **Step 2: Add the nav item**

In the `Operations` section's `items` array (around line 263), add a new entry directly after Services:

```ts
        { href: `/dashboard/${venueSlug}/services`, label: "Services", icon: ShoppingBag },
        { href: `/dashboard/${venueSlug}/services/contests`, label: "Contests", icon: Gift },
        { href: `/dashboard/${venueSlug}/rooms`, label: "Rooms", icon: DoorOpen },
```

(Replacing just the `Services` and `Rooms` lines with these three — `Services` and `Rooms` are unchanged, `Contests` is inserted between them.)

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/venue-sidebar.tsx
git commit -m "feat: add Contests sidebar entry"
```

---

## Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS, zero errors

- [ ] **Step 2: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS, all tests including the new Giveaways/Raffles API tests from Tasks 3–4

- [ ] **Step 3: Lint**

Run: `cd apps/web && npx eslint app/dashboard/\[slug\]/services/contests app/api/venues/\[venueId\]/contests components/contest-form-dialog.tsx components/contests-board.tsx components/contest-entries-drawer.tsx components/ui/sheet.tsx lib/api/xvm-api.ts lib/api/resolve-entry-names.ts`
Expected: PASS, zero errors

- [ ] **Step 4: Live check against local dev**

Per `CLAUDE.md`: static checks alone aren't enough. Start the local stack (`docs/LOCAL_DEV.md` — `docker-compose.local.yml` + `pnpm dev` at `localhost:3000`) and click through:

1. Navigate to a venue's `/dashboard/<slug>/services/contests` — confirm the page loads, sidebar shows "Contests" between Services and Rooms.
2. As a Manager/Owner: create a giveaway, confirm it appears as a card with the "Open" badge.
3. Click the card, confirm the entries drawer opens (empty state, since xvm-api's local dev has no bot-side entries yet).
4. Create a raffle, confirm the pot/cost-per-ticket line renders correctly on the card.
5. Click "Roll" on a contest with zero entries, confirm the API's 409 ("nobody entered") surfaces as a toast, not a crash.
6. As a Staff-tier member (or by toggling `canManage` off), confirm the "New Contest" button and "Roll" buttons are absent, and the card is still clickable to view the (read-only) entries drawer.

- [ ] **Step 5: Final commit if the live check turned up fixes**

If Step 4 required any code changes, commit them:

```bash
git add -A
git commit -m "fix: address issues found in contests dashboard live check"
```

---

## Self-review notes

- **Spec coverage:** every section of `2026-09-06-contests-dashboard-design.md` maps to a task — architecture/file layout (Tasks 1–14), list page (13), form dialog (11), entries drawer (12), roll flow (13), permissions (routes rely on xvm-api's own 403, UI hides affordances via `canManage`, matching the design's explicit choice), sidebar placement (15), testing (3, 4, 16).
- **Type consistency:** `discord_user_id` is `string` everywhere on the TS side (client types, resolved-entry type, component props) — verified against the merged `origin/dev` xvm-api schema, not the pre-fix `int` version.
- **Scope discipline:** giveaway entries stayed view-only per the approved design (no manual add/remove), even though the API exposes `enter_giveaway`/`leave_giveaway` — that capability was not part of what was brainstormed and approved, so it's deliberately left out here.
