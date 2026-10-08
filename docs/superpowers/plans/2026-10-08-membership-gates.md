# Membership Gates Off Prisma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "who is a member of this venue, and as what" come from xvm-api everywhere the dashboard asks it, so anyone who joined by invite or was promoted in the staff UI can use the dashboard.

**Architecture:** One small module, `lib/api/venue-access.ts`, answers the question from xvm-api's `GET /me/venues` (everywhere the caller currently works, with the effective tier, so a member who has left is already excluded). Pages call `roleInVenue`; API routes call `requireVenueRole`; the venue list calls `myVenueRoles`. Each consumer changes only its membership lookup, so everything downstream (role strings, response shapes, error text) stays as it is. A lint rule then stops `prisma.membership` coming back.

**Tech Stack:** Next.js route handlers and server components, TypeScript, Prisma (venue bridge only), vitest, xvm-api `/me/venues`.

---

Status: proposed, 2026-10-08. Nothing built yet.

## Why

On `dev`, the dashboard decides membership and role from Prisma's `memberships` table. Nothing writes that table any more except venue creation (the creator's owner row). `POST /invites/accept` goes to xvm-api only (`app/api/invites/[token]/accept/route.ts`), and so does promotion in the staff UI. So anyone other than a venue's creator has no Prisma row.

Reproduced on 2026-10-08 against a local Postgres and a local xvm-api on `dev` (`541ef9e`), with the real route handlers and only the session mocked. Ann created the venue. Bee was invited as `manager` and accepted, so xvm-api lists Bee as `manager` and Prisma holds only Ann's row:

| Call | Ann (creator) | Bee (invited manager) |
|---|---|---|
| dashboard `GET /api/venues/[id]/timeline` | 200 | **403 Forbidden** |
| dashboard `POST /api/venues/[id]/services` | 201 | **403 "You don't have permission to create services"** |
| xvm-api directly, Bee's own token: list transactions | n/a | 200 |
| xvm-api directly, Bee's own token: create service | n/a | 201 |

xvm-api allows exactly what the dashboard refuses. It reaches further than the API routes: `GET /api/venues` lists venues by Prisma membership and 13 server pages call `notFound()` when `venue.memberships` is empty, so an invitee would not see the venue at all (read from the code, not run in a browser).

**Not live on prod.** `origin/main` is 68 commits behind `dev` and still runs the old Prisma invite flow, which writes the Prisma membership. This is a blocker for promoting `dev` to `main`, the same shape as #127. The dev site is affected today for anyone who joined by invite.

## Scope

**In scope**

| Area | Files |
|---|---|
| Venue list and venue delete | `app/api/venues/route.ts` (GET), `app/api/venues/[venueId]/route.ts` (DELETE) |
| Invite accept | `app/api/invites/[token]/accept/route.ts` (cache invalidation only) |
| Server pages (13) | `ban-list`, `events`, `events/[eventId]`, `hours`, `live`, `[slug]/page.tsx`, `patron-logs`, `reaction-roles`, `rooms`, `services/contests`, `shifts`, `staff`, `timeline`, all under `app/dashboard/[slug]/` |
| Dashboard landing and account | `app/dashboard/page.tsx`, `app/dashboard/account/page.tsx` |
| API gates, services family | `services/route.ts`, `services/[serviceId]/route.ts`, `services/categories/route.ts`, `services/categories/[categoryId]/route.ts`, `services/[serviceId]/positions/route.ts`, `services/[serviceId]/positions/[positionId]/route.ts`, `services/[serviceId]/inventory/route.ts`, `services/[serviceId]/inventory/movements/route.ts`, `inventory/item-search/route.ts` |
| API gates, the rest | `transactions/route.ts`, `transactions/[transactionId]/route.ts`, `timeline/route.ts`, `events/route.ts`, `events/[eventId]/route.ts`, `events/[eventId]/attendance/route.ts`, `settings/route.ts`, `app/api/stream/[venueId]/route.ts` |
| API gates, Prisma-backed | `inventory-settings/route.ts`, `frogge/disconnect/route.ts`, `frogge/members/route.ts`, `frogge/redeem/route.ts`, `sync-partake/route.ts` |

All API paths above are under `app/api/venues/[venueId]/` unless a full path is given.

**Out of scope, on purpose**

| What | Why |
|---|---|
| `app/api/plugin/**`, `lib/api/plugin-auth.ts` | Plugin routes stay on Prisma until the plugin cutover (decided 2026-09-18). |
| `shifts/[shiftId]/cancel-group`, `cancel-series`, `lib/shift-bot.ts` | The shift pipeline waits on xvm-api (no bulk cancel, no recurrence match). |
| `lib/notify.ts` | Notification recipients wait on xvm-api#151 and the emitters. |
| `lib/api/transactions.ts:122` | A nickname lookup for a display name, not a gate. A missing row already falls back. |
| `_count.events` and `_count.memberships` on the landing page | Stale Prisma counts. A separate stale-read fix, noted in Task 3. |

## Decisions

**Order.** Land the venue-creation plan (#138) first. After it every new venue is created in xvm-api, so there is no "unconnected venue" to handle, and `xvm-connect` is gone. A venue that predates it exists only on `dev` (disposable) until the maintenance window creates it in xvm-api. A venue with no xvm-api venue simply gets no role here, which is the right answer for a state that will not exist once everything runs on xvm-api.

1. **Fail closed.** If xvm-api cannot be reached, no role can be established. API routes answer 503, never 403 (a refusal has to mean "not a member"), and pages let the error propagate to the existing `app/dashboard/[slug]/error.tsx`. There is no Prisma fallback, per the standing rule. Agreed 2026-10-08: with xvm-api the only path, there is nothing to fall back to.
2. **Employment is enforced here through `/me/venues`, and xvm-api does not enforce it itself.** `GET /me/venues` is documented as "everywhere you currently work", and a test in xvm-api asserts that termination drops the venue from it, so a member who has left is simply not in the list and gets the same refusal as a stranger. xvm-api's own venue-scoped authorization (`dependencies.py`: `require_tier`, `has_tier`) never reads `is_employed`. Checked on a local xvm-api on 2026-10-08: after `terminate`, a manager could still create a service category, a service and an invite. That is xvm-api#154. Until it is fixed, the dashboard gate is the only barrier on the Prisma-backed routes in Task 7, and the bot and any client calling xvm-api directly are not covered by it. The old Prisma `status: "active"` filter never reflected terminations after the cutover, so this is stricter than what it replaces.

## File structure

| File | Responsibility |
|---|---|
| Modify `apps/web/lib/api/xvm-api.ts` | Add `MyVenueRow` and `listMyVenues` (`GET /me/venues`). |
| Modify `apps/web/lib/api/xvm-api.test.ts` | One test for `listMyVenues`. |
| Create `apps/web/lib/api/venue-access.ts` | Role resolution from xvm-api: `roleInVenue`, `myVenueRoles`, `requireVenueRole`, `atLeast`, `asMembership`, `VenueAccessUnavailable`. |
| Create `apps/web/lib/api/venue-access.test.ts` | Unit tests for all of the above. |
| Modify the files in the scope tables | Swap the membership lookup for the helper. |
| Modify `apps/web/eslint.config.mjs` | Ban `prisma.membership` outside an explicit allowlist. |

## PR slices

One worktree and one PR per slice (`CLAUDE.md`), all against `dev`, in this order. Task 1 must land first. Tasks 2 to 7 are independent of each other. Task 8 goes last, because it fails lint until everything above has landed.

| PR | Tasks |
|---|---|
| A | Task 1 |
| B | Tasks 2 and 3 |
| C | Task 4 |
| D | Task 5 |
| E | Task 6 |
| F | Task 7 |
| G | Task 8 |

---

### Task 1: The `/me/venues` client and the access helper

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (add after `getMe`, around line 335)
- Modify: `apps/web/lib/api/xvm-api.test.ts` (the import list, and one test after the `listMyCharacters` test, around line 1260)
- Create: `apps/web/lib/api/venue-access.ts`
- Test: `apps/web/lib/api/venue-access.test.ts`

- [ ] **Step 1: Write the failing client test**

In `lib/api/xvm-api.test.ts`, add `listMyVenues,` to the import list next to `listMyCharacters,`, and add this test directly after the `listMyCharacters` test:

```ts
  it("listMyVenues reads the venues the caller currently works at", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await expect(listMyVenues("token")).resolves.toEqual([])
    expect(new URL(lastCall()[0]).pathname).toMatch(/\/me\/venues$/)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/web`): `pnpm exec vitest run lib/api/xvm-api.test.ts -t listMyVenues`
Expected: FAIL, "listMyVenues is not a function".

- [ ] **Step 3: Add the client function**

In `lib/api/xvm-api.ts`, directly after `getMe`:

```ts
export interface MyVenueRow {
  venue: VenueRow
  tier: string
  effective_tier: string
}

export async function listMyVenues(personToken: string): Promise<MyVenueRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MyVenueRow[]>("/me/venues", {}, personToken)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/api/xvm-api.test.ts -t listMyVenues`
Expected: PASS, 1 test.

- [ ] **Step 5: Write the failing helper test**

Create `lib/api/venue-access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  token: vi.fn(),
  listMyVenues: vi.fn(),
  venueFindUnique: vi.fn(),
  venueFindMany: vi.fn(),
  errorResponse: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFindUnique, findMany: m.venueFindMany } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyVenues: m.listMyVenues }))

import { NextResponse } from "next/server"
import {
  VenueAccessUnavailable,
  asMembership,
  atLeast,
  myVenueRoles,
  requireVenueRole,
  roleInVenue,
} from "@/lib/api/venue-access"

const connected = { xvmApiVenueId: "ven_1" }
const unconnected = { xvmApiVenueId: null }
const row = (id: string, tier: string, effective = tier) => ({ venue: { id }, tier, effective_tier: effective })

beforeEach(() => {
  vi.resetAllMocks()
  m.token.mockResolvedValue("tok")
  m.listMyVenues.mockResolvedValue([row("ven_1", "manager"), row("ven_2", "staff"), row("ven_3", "something-new")])
})

describe("atLeast", () => {
  it("orders staff < manager < owner and refuses no role", () => {
    expect(atLeast("OWNER", "MANAGER")).toBe(true)
    expect(atLeast("MANAGER", "MANAGER")).toBe(true)
    expect(atLeast("STAFF", "MANAGER")).toBe(false)
    expect(atLeast(null, "STAFF")).toBe(false)
  })
})

describe("roleInVenue", () => {
  it("reads the role from xvm-api, upper-cased to the strings the app already uses", async () => {
    expect(await roleInVenue("u1", connected)).toBe("MANAGER")
  })

  it("uses the effective tier, so a live temporary grant counts", async () => {
    m.listMyVenues.mockResolvedValue([row("ven_1", "staff", "manager")])
    expect(await roleInVenue("u1", connected)).toBe("MANAGER")
  })

  it("answers null for a venue that is not in the list, which is how a member who has left looks", async () => {
    expect(await roleInVenue("u1", { xvmApiVenueId: "ven_9" })).toBeNull()
  })

  it("ignores a tier it does not know rather than guessing a role", async () => {
    expect(await roleInVenue("u1", { xvmApiVenueId: "ven_3" })).toBeNull()
  })

  it("answers null for a venue with no xvm-api venue, without asking xvm-api", async () => {
    expect(await roleInVenue("u1", unconnected)).toBeNull()
    expect(m.listMyVenues).not.toHaveBeenCalled()
  })

  it("throws, instead of answering no access, when there is no credential", async () => {
    m.token.mockResolvedValue(null)
    await expect(roleInVenue("u1", connected)).rejects.toBeInstanceOf(VenueAccessUnavailable)
  })

  it("lets an xvm-api failure propagate, instead of answering no access", async () => {
    m.listMyVenues.mockRejectedValue(new Error("boom"))
    await expect(roleInVenue("u1", connected)).rejects.toThrow("boom")
  })
})

describe("myVenueRoles", () => {
  it("maps Prisma venue ids to roles", async () => {
    m.venueFindMany.mockResolvedValue([
      { id: "p1", xvmApiVenueId: "ven_1" },
      { id: "p2", xvmApiVenueId: "ven_2" },
    ])
    const roles = await myVenueRoles("u1")
    expect([...roles]).toEqual([
      ["p1", "MANAGER"],
      ["p2", "STAFF"],
    ])
    expect(m.venueFindMany).toHaveBeenCalledWith({
      where: { xvmApiVenueId: { in: ["ven_1", "ven_2"] } },
      select: { id: true, xvmApiVenueId: true },
    })
  })
})

describe("asMembership", () => {
  it("has the fields the client pages read off /api/venues", () => {
    expect(asMembership("u1", "p1", "MANAGER")).toEqual({ userId: "u1", venueId: "p1", role: "MANAGER", status: "active" })
  })
})

describe("requireVenueRole", () => {
  beforeEach(() => m.venueFindUnique.mockResolvedValue(connected))

  it("lets an invited manager through even though Prisma has no membership row", async () => {
    const access = await requireVenueRole("u1", "p1", "MANAGER", "no")
    expect(access).toEqual({ ok: true, role: "MANAGER" })
  })

  it("refuses with the route's own message when the role is too low", async () => {
    const access = await requireVenueRole("u1", "p2", "OWNER", "Only the owner can do that")
    expect(access.ok).toBe(false)
    if (access.ok) return
    expect(access.response.status).toBe(403)
    expect(await access.response.json()).toEqual({ error: "Only the owner can do that" })
  })

  it("answers 403, not 404, for a venue that does not exist", async () => {
    m.venueFindUnique.mockResolvedValue(null)
    const access = await requireVenueRole("u1", "missing", "STAFF", "nope")
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(403)
  })

  it("answers 503, never 403, when there is no credential", async () => {
    m.token.mockResolvedValue(null)
    const access = await requireVenueRole("u1", "p1", "STAFF", "nope")
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(503)
  })

  it("hands an xvm-api failure to the shared error mapper, so an unreachable API is not a refusal", async () => {
    const failure = NextResponse.json({ error: "xvm-api unavailable" }, { status: 502 })
    m.listMyVenues.mockRejectedValue(new Error("down"))
    m.errorResponse.mockResolvedValue(failure)
    const access = await requireVenueRole("u1", "p1", "STAFF", "nope")
    expect(access).toEqual({ ok: false, response: failure })
    expect(m.errorResponse).toHaveBeenCalledWith(expect.any(Error), "u1", "[venue access] /me/venues read error")
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run lib/api/venue-access.test.ts`
Expected: FAIL, "Failed to resolve import @/lib/api/venue-access".

- [ ] **Step 7: Write the implementation**

Create `lib/api/venue-access.ts`:

```ts
import { cache } from "react"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { listMyVenues } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export type VenueRole = "OWNER" | "MANAGER" | "STAFF"

const RANK: Record<VenueRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 }

export function atLeast(role: VenueRole | null, minimum: VenueRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum]
}

export class VenueAccessUnavailable extends Error {}

function toRole(tier: string): VenueRole | null {
  const role = tier.toUpperCase()
  return role === "OWNER" || role === "MANAGER" || role === "STAFF" ? role : null
}

const tiersFor = cache(async (userId: string): Promise<Map<string, VenueRole>> => {
  const token = await getValidXvmApiToken(userId)
  if (!token) throw new VenueAccessUnavailable("No valid xvm-api credential")
  const tiers = new Map<string, VenueRole>()
  for (const row of await listMyVenues(token)) {
    const role = toRole(row.effective_tier)
    if (role) tiers.set(row.venue.id, role)
  }
  return tiers
})

export async function roleInVenue(
  userId: string,
  venue: { xvmApiVenueId: string | null }
): Promise<VenueRole | null> {
  if (!venue.xvmApiVenueId) return null
  return (await tiersFor(userId)).get(venue.xvmApiVenueId) ?? null
}

export async function myVenueRoles(userId: string): Promise<Map<string, VenueRole>> {
  const tiers = await tiersFor(userId)
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { in: [...tiers.keys()] } },
    select: { id: true, xvmApiVenueId: true },
  })
  const roles = new Map<string, VenueRole>()
  for (const venue of venues) {
    if (!venue.xvmApiVenueId) continue
    const role = tiers.get(venue.xvmApiVenueId)
    if (role) roles.set(venue.id, role)
  }
  return roles
}

export function asMembership(userId: string, venueId: string, role: VenueRole) {
  return { userId, venueId, role, status: "active" }
}

export type VenueAccess = { ok: true; role: VenueRole } | { ok: false; response: NextResponse }

export async function requireVenueRole(
  userId: string,
  venueId: string,
  minimum: VenueRole,
  forbiddenMessage: string
): Promise<VenueAccess> {
  const deny = (): VenueAccess => ({
    ok: false,
    response: NextResponse.json({ error: forbiddenMessage }, { status: 403 }),
  })
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue) return deny()
  try {
    const role = await roleInVenue(userId, venue)
    return role && atLeast(role, minimum) ? { ok: true, role } : deny()
  } catch (err) {
    if (err instanceof VenueAccessUnavailable) {
      return { ok: false, response: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
    }
    return { ok: false, response: await xvmApiErrorResponse(err, userId, "[venue access] /me/venues read error") }
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/api/venue-access.test.ts lib/api/xvm-api.test.ts`
Expected: PASS, 15 helper tests plus the whole client file. If a helper test leaks state between cases, `cache` is memoising across tests in this environment; wrap `tiersFor` so the memoised function is created per call site, or drop `cache` and accept one `/me/venues` call per use.

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint lib/api/venue-access.ts lib/api/venue-access.test.ts lib/api/xvm-api.ts lib/api/xvm-api.test.ts`
Expected: no errors. `xvm-api.test.ts` already has one unused-import warning (`TemplateRow`), which is not from this change.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api.test.ts apps/web/lib/api/venue-access.ts apps/web/lib/api/venue-access.test.ts
git commit -m "Resolve venue roles from xvm-api's current-venues list instead of the Prisma membership table"
```

---

### Task 2: Venue list, venue delete, invite accept

**Files:**
- Modify: `apps/web/app/api/venues/route.ts` (the `GET`, around lines 127-170)
- Modify: `apps/web/app/api/venues/[venueId]/route.ts` (the `DELETE`, around lines 98-140)
- Modify: `apps/web/app/api/invites/[token]/accept/route.ts` (after `acceptInvite` succeeds, around line 30)

`GET /api/venues` keeps its response shape, with `memberships: [{ userId, venueId, role, status }]`, so every client page that reads `venue.memberships?.[0]?.role` or `m.status === "active"` keeps working untouched.

- [ ] **Step 1: Replace the Prisma query in `GET /api/venues`**

Add to the imports of `app/api/venues/route.ts`:

```ts
import { asMembership, myVenueRoles, VenueAccessUnavailable } from "@/lib/api/venue-access"
```

Replace the `getOrSet` callback body (the `return await prisma.venue.findMany({ where: { memberships: ... }, include: { memberships: ... } })`) with:

```ts
          const roles = await myVenueRoles(session.user.id)
          const rows = await prisma.venue.findMany({ where: { id: { in: [...roles.keys()] } } })
          return rows.flatMap((venue) => {
            const role = roles.get(venue.id)
            return role ? [{ ...venue, memberships: [asMembership(session.user.id, venue.id, role)] }] : []
          })
```

In the `GET` handler's `catch`, before the existing `console.error("Error fetching venues:", error)`, add:

```ts
      if (error instanceof VenueAccessUnavailable) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }
```

- [ ] **Step 2: Replace the owner check in `DELETE /api/venues/[venueId]`**

In `app/api/venues/[venueId]/route.ts`, replace the `prisma.venue.findUnique({ ..., include: { memberships: ... } })` call, the `if (!venue)` check, and the `if (venue.memberships.length === 0 || venue.memberships[0].role !== "OWNER")` check with:

```ts
      const access = await requireVenueRole(session.user.id, venueId, "OWNER", "Only venue owners can delete venues")
      if (!access.ok) return access.response

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }
```

and add `import { requireVenueRole } from "@/lib/api/venue-access"`. A venue that does not exist now answers 403 from the helper, as every other converted route does, so the 404 only covers a delete racing this one.

- [ ] **Step 3: Invalidate the venue list when an invite is accepted**

In `app/api/invites/[token]/accept/route.ts`, directly after `const membership = await acceptInvite(personToken, token)`, add:

```ts
    await invalidateCache(cacheKeys.userVenues(session.user.id))
```

with `import { invalidateCache, cacheKeys } from "@/lib/redis-cache"` if not already imported. Without this, a person who just joined sees no venue for up to five minutes (the list is cached per user).

- [ ] **Step 4: Typecheck, run the suite, and run the acceptance check**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS. Then run the Appendix check; the "Bee venue list" row should now list the venue.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/venues/route.ts "apps/web/app/api/venues/[venueId]/route.ts" "apps/web/app/api/invites/[token]/accept/route.ts"
git commit -m "List and delete venues by xvm-api membership, and refresh the list on invite accept"
```

---

### Task 3: Dashboard landing and account page

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx` (query at lines 34-48, role at line 85)
- Modify: `apps/web/app/dashboard/account/page.tsx` (query at lines 13-26, list at lines 109-135)

- [ ] **Step 1: Landing page**

Import `myVenueRoles` from `@/lib/api/venue-access`. Replace the `prisma.venue.findMany({ where: { memberships: ... }, include: { memberships: ..., _count: ... }, orderBy })` call with:

```ts
  const roles = await myVenueRoles(session.user.id)
  const venues = await prisma.venue.findMany({
    where: { id: { in: [...roles.keys()] } },
    include: {
      _count: {
        select: { events: true, memberships: true },
      },
    },
    orderBy: { name: "asc" },
  })
```

and change `const role = venue.memberships[0].role` to `const role = roles.get(venue.id) ?? "STAFF"`.

`_count.events` and `_count.memberships` still read Prisma tables that nothing writes any more, so the "Events" and "Staff" numbers on each card are stale. That is a separate fix (the numbers belong to xvm-api), deliberately not folded in here.

- [ ] **Step 2: Account page**

Import `myVenueRoles`. Replace the `prisma.user.findUnique({ ... include: { memberships: ..., _count: ... } })` and the `if (!user) redirect("/auth/signin")` that follows it with:

```ts
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (!user) redirect("/auth/signin")

  const roles = await myVenueRoles(session.user.id)
  const venues = await prisma.venue.findMany({
    where: { id: { in: [...roles.keys()] } },
    select: { id: true, name: true, slug: true, dataCenter: true, world: true },
    orderBy: { name: "asc" },
  })
```

In the "Your venues" block, replace `user.memberships` with `venues` (`venues.length > 0`, `venues.length`, `venues.map((venue) => (`), `key={m.id}` with `key={venue.id}`, every `m.venue.` with `venue.`, and `{m.role.toLowerCase()}` with `{roles.get(venue.id)?.toLowerCase()}`.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint app/dashboard/page.tsx app/dashboard/account/page.tsx`
Expected: no output. Then load `/dashboard` and `/dashboard/account` as the invited manager in the Appendix stack and confirm the venue is listed with the role `manager`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/page.tsx apps/web/app/dashboard/account/page.tsx
git commit -m "Show a person's venues and roles from xvm-api on the landing and account pages"
```

---

### Task 4: The 13 server pages

**Files (all under `apps/web/app/dashboard/[slug]/`):** `ban-list/page.tsx`, `events/page.tsx`, `events/[eventId]/page.tsx`, `hours/page.tsx`, `live/page.tsx`, `page.tsx`, `patron-logs/page.tsx`, `reaction-roles/page.tsx`, `rooms/page.tsx`, `services/contests/page.tsx`, `shifts/page.tsx`, `staff/page.tsx`, `timeline/page.tsx`

Every one of them has this shape:

```ts
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
```

(brace and spacing variants exist in `staff`, `events`, `events/[eventId]`, `live` and `timeline`; the content is the same.) Replace it, in each file, with:

```ts
  const venue = await prisma.venue.findUnique({ where: { slug } })
  const userRole = venue ? await roleInVenue(session.user.id, venue) : null
  if (!venue || !userRole) notFound()
```

and add `import { roleInVenue } from "@/lib/api/venue-access"`. `userRole` is now `VenueRole`, not `string`; `VenueLayout`'s `userRole: string` accepts it.

Per-file differences, each of which must be applied:

- [ ] `[slug]/page.tsx`: the query also has `_count: { select: { follows: true } }`. Keep it: `prisma.venue.findUnique({ where: { slug }, include: { _count: { select: { follows: true } } } })`.
- [ ] `shifts/page.tsx`: line 75 uses `userRole={venue.memberships[0].role}` inline. Change it to `userRole={userRole}`.
- [ ] `events/page.tsx`: line 88 uses `venue.memberships[0].role === "STAFF"`. Change it to `userRole === "STAFF"`. Delete the later `const userRole = venue.memberships[0].role` (line 98), since it is now declared at the guard.
- [ ] `events/[eventId]/page.tsx`: the role is read at line 80, after the event fetch. Move the lookup up to the guard as above and delete line 80.
- [ ] `ban-list/page.tsx`: keep `if (!["OWNER", "MANAGER"].includes(userRole)) notFound()` as it is.
- [ ] `hours`, `live`, `patron-logs`, `reaction-roles`, `rooms`, `services/contests`, `staff`, `timeline`: no difference beyond the canonical block.

- [ ] **Step 1: Apply the edits above to all 13 files**

- [ ] **Step 2: Confirm no server page still reads `venue.memberships`**

Run (from `apps/web`): `grep -rn "venue\.memberships" "app/dashboard/[slug]" --include=page.tsx`
Expected: only client pages (`services/page.tsx`, `settings/page.tsx`, `staff/invite/page.tsx`, `staff/roles/page.tsx`, `tasks/page.tsx`, `events/new/page.tsx`, `event-templates/page.tsx`), which read `/api/venues` and are fixed by Task 2.

- [ ] **Step 3: Typecheck, lint, run the suite**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/[slug]"
git commit -m "Gate dashboard pages on the xvm-api role instead of a Prisma membership row"
```

---

### Task 5: API gates, services family

**Files (under `apps/web/app/api/venues/[venueId]/`):** the nine files in the services-family row of the scope table.

The block to replace is:

```ts
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership /* or: || !["OWNER", "MANAGER"].includes(membership.role) */) {
      return NextResponse.json({ error: "<existing message>" }, { status: 403 })
    }
```

with, using the same message string the file already returns:

```ts
    const access = await requireVenueRole(session.user.id, venueId, "<minimum>", "<existing message>")
    if (!access.ok) return access.response
```

and `import { requireVenueRole } from "@/lib/api/venue-access"`. Leave the `getValidXvmApiToken` and `requireXvmVenueId` code that follows exactly as it is. Worked example, `services/route.ts` POST:

```ts
    const { venueId } = await context.params
    const access = await requireVenueRole(
      session.user.id,
      venueId,
      "MANAGER",
      "You don't have permission to create services"
    )
    if (!access.ok) return access.response

    const token = await getValidXvmApiToken(session.user.id)
```

Minimum role for each block (the predicate the existing code already uses):

| File | Handler (line of the existing check) | Minimum |
|---|---|---|
| `services/route.ts` | GET (43), POST (78) | STAFF, MANAGER |
| `services/[serviceId]/route.ts` | GET (43), write (78) | STAFF, MANAGER |
| `services/categories/route.ts` | GET (40), POST (75) | STAFF, MANAGER |
| `services/categories/[categoryId]/route.ts` | write (45), delete (95) | MANAGER, OWNER |
| `services/[serviceId]/positions/route.ts` | (39) | MANAGER |
| `services/[serviceId]/positions/[positionId]/route.ts` | (32) | MANAGER |
| `services/[serviceId]/inventory/route.ts` | (42), (92) | MANAGER, MANAGER |
| `services/[serviceId]/inventory/movements/route.ts` | (41), (76) | STAFF, MANAGER |
| `inventory/item-search/route.ts` | (44) | MANAGER |

- [ ] **Step 1: Apply the replacement to every block in the table**
- [ ] **Step 2: Remove the `import { prisma } ...` line in any file where `prisma` is now unused** (the compiler and lint will say which)
- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: no new errors. Then run the Appendix check; the "Bee create service" row should now be 201.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]"
git commit -m "Gate the services and inventory routes on the xvm-api role"
```

---

### Task 6: API gates, the rest

**Files:** the "API gates, the rest" row of the scope table, plus their tests.

Same replacement as Task 5, with these minimums. Four files need more than the swap because they use the role afterwards:

| File | Handler (line) | Minimum | Also change |
|---|---|---|---|
| `transactions/route.ts` | GET (80), POST (133) | STAFF | none |
| `transactions/[transactionId]/route.ts` | (48), (107) | STAFF | none |
| `timeline/route.ts` | GET (35) | STAFF | none |
| `events/[eventId]/attendance/route.ts` | (30) | STAFF | none |
| `events/route.ts` | POST (133) | STAFF | line 162: `membership.role === "STAFF"` becomes `access.role === "STAFF"` |
| `events/[eventId]/route.ts` | (87) | STAFF | line 100: `membership.role` becomes `access.role` |
| `app/api/stream/[venueId]/route.ts` | (22) | STAFF | line 29: `const isManager = atLeast(access.role, "MANAGER")` (import `atLeast`) |
| `settings/route.ts` | GET (100), PUT (212) | STAFF | lines 230-231: `const isOwner = access.role === "OWNER"` and `const isManager = access.role === "MANAGER"` |

- [ ] **Step 1: Update the four route tests that mock `prisma.membership`** (`events/route.test.ts`, `events/[eventId]/route.test.ts`, `events/[eventId]/attendance/route.test.ts`, `timeline/route.test.ts`)

In each test file, replace the membership mock with a mock of the helper. Before (attendance test):

```ts
  membership: vi.fn(),
...
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...
    membership: { findFirst: m.membership },
...
m.membership.mockResolvedValue({ id: "m1" })
...
m.membership.mockResolvedValue(null)
```

After:

```ts
  access: vi.fn(),
...
vi.mock("@/lib/api/venue-access", () => ({ requireVenueRole: m.access }))
...
m.access.mockResolvedValue({ ok: true, role: "STAFF" })
...
m.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) })
```

with `import { NextResponse } from "next/server"` in the test. Where a test asserts on `membership.role` (the STAFF visibility cases in `events` and `events/[eventId]`), set `role: "STAFF"` or `"MANAGER"` in the resolved value. Keep `venue.findUnique` in the `@/lib/prisma` mock where the route still calls it.

- [ ] **Step 2: Apply the replacement and the extra changes in the table**
- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: no new errors; the four updated tests pass. Then run the Appendix check; the "Bee timeline" row should now be 200.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api"
git commit -m "Gate transactions, events, settings and timeline routes on the xvm-api role"
```

---

### Task 7: API gates, Prisma-backed routes

**Files:** the "API gates, Prisma-backed" row of the scope table.

These routes read and write Prisma tables after the gate (Frogge, Partake, inventory settings), so the gate is their only authority and nothing downstream backs it. They get the same swap. Because the role now comes from `/me/venues`, a member who no longer works at the venue is refused here too. xvm-api would not refuse them (xvm-api#154), so for these routes the dashboard gate is the only barrier.

| File | Handler (line) | Minimum |
|---|---|---|
| `inventory-settings/route.ts` | GET (27), PUT (line 74 checks `resolved.membership.role`) | STAFF, MANAGER |
| `frogge/disconnect/route.ts` | (15) | MANAGER |
| `frogge/redeem/route.ts` | (16) | MANAGER |
| `frogge/members/route.ts` | (16) | keep the minimum of the existing `where.role` filter; if it has none, STAFF |
| `sync-partake/route.ts` | (16) | MANAGER |

For `frogge/disconnect`, `frogge/redeem` and `sync-partake` the role is in the Prisma `where` (`role: { in: ["OWNER", "MANAGER"] }`), so the replacement block is the `findFirst` call plus its `if (!membership)`; use the message the `if` returns. For `inventory-settings` PUT, replace `resolved.membership.role` with the role from `access`.

- [ ] **Step 1: Apply the replacements**
- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]"
git commit -m "Gate the Prisma-backed venue routes on the xvm-api role"
```

---

### Task 8: Stop it coming back

**Files:**
- Modify: `apps/web/eslint.config.mjs`

- [ ] **Step 1: Add the rule**

Insert before the closing `])` of `defineConfig`:

```js
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "app/api/plugin/**",
      "lib/api/plugin-auth.ts",
      "app/api/venues/[[]venueId]/shifts/[[]shiftId]/cancel-group/route.ts",
      "app/api/venues/[[]venueId]/shifts/[[]shiftId]/cancel-series/route.ts",
      "lib/shift-bot.ts",
      "lib/notify.ts",
      "lib/api/transactions.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='prisma'][property.name='membership']",
          message: "Venue membership lives in xvm-api. Use roleInVenue or requireVenueRole from lib/api/venue-access.",
        },
      ],
    },
  },
```

The ignore list is exactly the out-of-scope table above.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: 0 errors. An error in an unlisted file means a gate this plan missed. Convert it as in Task 5. Only add it to `ignores` if it belongs to the plugin, shift-pipeline or notification work, and say why in the commit message.

Checked against `dev` before Tasks 5 to 7: the rule flags exactly the 23 files those tasks convert (9 + 9 + 5) and none of the ignored ones, so the escaped `[[]` globs match. It only catches direct `prisma.membership.*` calls. A nested `include: { memberships: ... }` (the pattern the pages and the venue list used) is not caught, so Task 4's grep in Step 2 is the check for that shape.

- [ ] **Step 3: Commit**

```bash
git add apps/web/eslint.config.mjs
git commit -m "Ban prisma.membership outside the plugin, shift and notification code"
```

---

## Follow-ups, not in this plan

- `isVenueOwner` in `lib/api/xvm-api-store.ts` (used by the Discord link routes) can become `requireVenueRole(..., "OWNER", ...)` once Task 1 lands. It drops a roster read per request for a `/me/venues` read. A tiny PR, but it edits code merged on 2026-10-08, so confirm with Allegro.
- `_count.events` and `_count.memberships` on the landing page (Task 3).
- xvm-api#154 (venue-scoped authorization ignores employment). Once it is fixed the bot and direct clients are covered too. Nothing in this plan changes.
- The shift routes, `lib/shift-bot.ts`, `lib/notify.ts` and the plugin routes, when their own cutovers happen. Each removal is one line in Task 8's `ignores`.

## Appendix: acceptance check

This is the reproduction used to find the problem. Run it before Task 2 (expect the "before" column) and after Tasks 2, 5 and 6 (expect "after"). Throwaway files, never committed.

Stack: `docker run -d --rm --name membership-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=venue -p 55433:5432 postgres:16-alpine`; `DATABASE_URL=postgresql://postgres:pw@localhost:55433/venue pnpm exec prisma db push --accept-data-loss` in `apps/web`; a local xvm-api on `dev` per `reference_xvm_api_local_sqlite_setup` (`uv sync`, `uv run alembic upgrade head`, `uv run python -m api.scripts.issue_credential --kind service --client dashboard --name repro`, `uv run python -m api`), with `XVM_API_DASHBOARD_SERVICE_TOKEN` set to that secret.

`apps/web/repro-seed.ts`: creates Ann and Bee through the real xvm-api flow (venue create, invite as `manager`, accept) and mirrors only the creator's membership into Prisma.

```ts
import { writeFileSync } from "node:fs"
import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const BASE = process.env.XVM_API_BASE_URL!
const SERVICE = process.env.XVM_API_DASHBOARD_SERVICE_TOKEN!

async function api(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const exchange = (discordId: string, name: string) =>
  api("/internal/tokens/exchange", SERVICE, {
    method: "POST",
    body: JSON.stringify({ provider: "discord", external_id: discordId, display_name: name }),
  })

async function main() {
  const a = await exchange("910000000000000001", "Creator Ann")
  const b = await exchange("910000000000000002", "Invitee Bee")
  const venue = await api("/venues", a.secret, {
    method: "POST",
    body: JSON.stringify({ name: "Repro Venue", slug: "repro-venue", data_center: "Light", world: "Twintania" }),
  })
  const invite = await api(`/venues/${venue.id}/invites`, a.secret, {
    method: "POST",
    body: JSON.stringify({ provider: "discord", external_id: "910000000000000002", display_name: "Invitee Bee", tier: "manager" }),
  })
  await api("/invites/accept", b.secret, { method: "POST", body: JSON.stringify({ token: invite.token ?? invite.secret }) })

  await prisma.user.create({ data: { id: "user-ann", name: "Creator Ann", email: "ann@example.test" } })
  await prisma.user.create({ data: { id: "user-bee", name: "Invitee Bee", email: "bee@example.test" } })
  await prisma.venue.create({
    data: { id: "venue-repro", name: "Repro Venue", slug: "repro-venue", dataCenter: "Light", world: "Twintania", ownerId: "user-ann", xvmApiVenueId: venue.id },
  })
  await prisma.membership.create({ data: { userId: "user-ann", venueId: "venue-repro", role: "OWNER", status: "active" } })
  for (const [userId, issued] of [["user-ann", a], ["user-bee", b]] as const) {
    await prisma.xvmApiCredential.create({
      data: { userId, token: issued.secret, credentialId: issued.credential.id, expiresAt: new Date(issued.credential.expires_at) },
    })
  }
  writeFileSync("repro-ids.json", JSON.stringify({ xvmVenueId: venue.id, annToken: a.secret, beeToken: b.secret }))
}

main().catch((err) => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
```

`apps/web/repro-membership.test.ts`: calls the real route handlers with only `next-auth`'s session mocked. The `vi.hoisted` block is needed because `vitest.config.ts` forces `XVM_API_BASE_URL` to `http://xvm-api.test`.

```ts
import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.XVM_API_BASE_URL = "http://127.0.0.1:8000"
})

let sessionUserId = "user-ann"
vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: sessionUserId } }),
  default: () => ({}),
}))

import { GET as timelineGET } from "@/app/api/venues/[venueId]/timeline/route"
import { POST as servicesPOST } from "@/app/api/venues/[venueId]/services/route"
import { GET as venuesGET } from "@/app/api/venues/route"

const ctx = { params: Promise.resolve({ venueId: "venue-repro" }) }
const callAs = async (userId: string, run: () => Promise<Response>) => {
  sessionUserId = userId
  const res = await run()
  return res.status
}
const timeline = () => timelineGET(new NextRequest("http://localhost/api/venues/venue-repro/timeline"), ctx)
const venues = () => venuesGET(new NextRequest("http://localhost/api/venues"))
const createService = () =>
  servicesPOST(
    new NextRequest("http://localhost/api/venues/venue-repro/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Repro Service", price: 10, isActive: true }),
    }),
    ctx
  )

describe("invited manager with no Prisma membership row", () => {
  it("is treated as the manager xvm-api says they are", async () => {
    const rows = {
      "Ann timeline": await callAs("user-ann", timeline),
      "Bee timeline": await callAs("user-bee", timeline),
      "Ann create service": await callAs("user-ann", createService),
      "Bee create service": await callAs("user-bee", createService),
      "Bee venue list": await callAs("user-bee", venues),
    }
    console.log(JSON.stringify(rows, null, 2))
    expect(rows["Bee timeline"]).toBe(200)
    expect(rows["Bee create service"]).toBe(201)
  })
})
```

Run it (from `apps/web`), with these set: `DATABASE_URL=postgresql://postgres:pw@localhost:55433/venue`, `XVM_API_BASE_URL=http://127.0.0.1:8000`, `XVM_API_DASHBOARD_SERVICE_TOKEN=<secret>`, `NEXTAUTH_SECRET=repro`, `NEXTAUTH_URL=http://localhost:3000`, `DISCORD_CLIENT_ID=x`, `DISCORD_CLIENT_SECRET=x`:

```bash
pnpm exec tsx repro-seed.ts
pnpm exec vitest run repro-membership.test.ts --disable-console-intercept
```

| Row | Before (measured 2026-10-08) | After |
|---|---|---|
| Ann timeline | 200 | 200 |
| Bee timeline | 403 | 200 |
| Ann create service | 201 | 201 |
| Bee create service | 403 | 201 |
| Bee venue list | not measured; expected to omit the venue | lists the venue with role `MANAGER` |

The test prints the table before its assertions, so the "before" run shows the numbers and then fails on `expect`. That is expected.

**Employment check** (needs Tasks 1, 2, 5 and 6; not run, the xvm-api calls are the ones shown working in the xvm-api#154 reproduction). Add `import { readFileSync } from "node:fs"` at the top of `repro-membership.test.ts` and this second test inside the same `describe`. It terminates Bee through xvm-api, then checks that the dashboard refuses her while xvm-api itself still accepts her token:

```ts
  it("refuses Bee once she is terminated, although xvm-api itself would not", async () => {
    const ids = JSON.parse(readFileSync("repro-ids.json", "utf8")) as { xvmVenueId: string; annToken: string; beeToken: string }
    const xvm = (path: string, token: string, init: RequestInit = {}) =>
      fetch(`http://127.0.0.1:8000${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })
    const roster = (await (await xvm(`/venues/${ids.xvmVenueId}/memberships`, ids.annToken)).json()) as { id: number; person: { display_name: string } }[]
    const bee = roster.find((entry) => entry.person.display_name === "Invitee Bee")!
    expect((await xvm(`/venues/${ids.xvmVenueId}/memberships/${bee.id}/terminate`, ids.annToken, { method: "POST", body: "{}" })).status).toBe(200)

    expect(await callAs("user-bee", timeline)).toBe(403)
    expect((await xvm(`/venues/${ids.xvmVenueId}/services`, ids.beeToken)).status).toBe(200)
  })
```

The last assertion documents xvm-api#154. When that is fixed it becomes 403 and should be changed with it.

Tear down: stop the xvm-api process, `docker stop membership-pg`, delete `repro-seed.ts`, `repro-membership.test.ts` and `repro-ids.json`.
