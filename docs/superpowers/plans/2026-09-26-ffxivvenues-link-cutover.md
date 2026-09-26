# FFXIV Venues link flow cutover (#57, PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the FFXIV Venues link, unlink, sync and status flow from Prisma plus a local fetcher to xvm-api, then delete the Prisma-side code.

**Architecture:**
- xvm-api owns the link, the import and the 2-hourly re-sync (`FFXIVVENUES_SYNC_INTERVAL`, run by its maintenance loop). The dashboard becomes a thin proxy: new client functions, new routes, and a picker in Settings fed by `GET /ffxivvenues/mine`.
- The dashboard's own sync code (`lib/ffxivvenues.ts`, `sync-ffxivvenues` route, cron route) is deleted. The Prisma columns and `VenueSchedule` table stay in the schema for PR 3.
- No `?? prisma` fallback. Once xvm-api covers the link, it is the only source.

**Tech Stack:** Next.js App Router, TypeScript strict, vitest.

**Worktree:** `~/xvm-dashboard-ffxiv-link`, branch `feat/ffxivvenues-link-cutover`, off `origin/dev` at `88e4f4d5`. Paths are relative to `apps/web/`. Run commands from `apps/web/`.

**Conventions:** no code comments at all (rationale goes in commit messages); match surrounding style; TS strict. Verify with `npx tsc --noEmit`, `pnpm run lint` and `npx vitest run` before calling anything done.

---

## Facts

- xvm-api routes (`src/api/routers/ffxivvenues.py` on `xvm-api` `origin/dev`):
  - `GET /ffxivvenues/mine` returns `ListingSummary[]` (`id`, `name`, `data_center`, `world`). It needs a person token.
  - `GET /venues/{id}/ffxivvenues` returns `ListingLinkRow` (`ffxivvenues_id`, `linked_at`, `last_synced_at`, `unlinked_at`), or 404 when the venue isn't linked.
  - `POST /venues/{id}/ffxivvenues/link` with body `{ffxivvenues_id}` returns 201 `SyncResult`. Owner tier, and the caller must be a listed manager of the listing. 403 otherwise, 404 no such listing, 409 already linked.
  - `POST /venues/{id}/ffxivvenues/sync` returns `SyncResult` and touches hours only. Manager tier. 409 if not linked.
  - `DELETE /venues/{id}/ffxivvenues/link` returns 204. Owner tier. It also removes the imported hours.
  - `SyncResult`: `hours_imported`, `hours_skipped`, `profile_updated`, `unlinked`, `synced_at`.
- **Behaviour change to surface in the UI:** the link is a full import. The listing's name, description, location, banner and hours land on the venue. Today's flow only synced a schedule. The picker must say so.
- `PublicVenue` and `PublicVenueBatch` (what `/api/public/venues` can read without a token) carry no listing id and no `external_links`. `external_links` lives on the token-gated `VenueDetail`.
- Aetherphone does not read `ffxivVenuesId` from `/api/public/venues`. It calls api.ffxivvenues.com directly. No in-repo consumer either.
- The settings page already holds `xvmApiVenueId` in state (`settings/page.tsx:98`, set at line 156).
- `mockFetchOnce` and `beforeEach(vi.stubGlobal("fetch", ...))` in `lib/api/xvm-api.test.ts` are the client test harness. Route handlers follow `app/api/venues/[venueId]/hours/route.ts`: `withRateLimit`, session check, `getValidXvmApiToken`, a local `requireXvmVenueId`, and `xvmApiErrorResponse` in the catch.

## Decisions to confirm before Task 4

1. **`/api/public/venues` drops `ffxivVenuesId`.** It can't be sourced from xvm-api in bulk today (see Facts), and nothing known reads it. The alternative is asking Allegro to add `ffxivvenues_id` to `PublicVenue`, which blocks this PR on an xvm-api change. Default in this plan: drop it.
2. **Picker only.** Linking accepts only ids from `/ffxivvenues/mine`. An owner with an empty picker sees a message pointing at ffxivvenues.com to be added as a manager.

## File Structure

- Modify `lib/api/xvm-api.ts`: types and five client functions.
- Modify `lib/api/xvm-api.test.ts`: client tests.
- Create `app/api/ffxivvenues/mine/route.ts`: picker data.
- Create `app/api/venues/[venueId]/ffxivvenues/route.ts`: GET status, POST link, DELETE unlink.
- Create `app/api/venues/[venueId]/ffxivvenues/sync/route.ts`: POST sync.
- Modify `app/api/venues/[venueId]/settings/route.ts`: drop the `ffxivVenue*` and `venueSchedule` handling.
- Modify `app/dashboard/[slug]/settings/page.tsx`: picker UI against the new routes.
- Modify `app/api/public/venues/route.ts`: drop `ffxivVenuesId`.
- Delete `lib/ffxivvenues.ts`, `app/api/venues/[venueId]/sync-ffxivvenues/route.ts`, `app/api/cron/sync-ffxivvenues-schedule/route.ts`, and the `sync-ffxivvenues-schedule` line in the crond container in `docker-compose.yml` (the schedule lives there, not in QStash).

---

### Task 1: xvm-api client functions

**Files:**
- Modify: `lib/api/xvm-api.ts` (after `deleteHours`, around line 720)
- Test: `lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `listMyFfxivListings`, `getFfxivLink`, `linkFfxivListing`, `syncFfxivListing`, `unlinkFfxivListing`, `XvmApiError` and `type ListingLinkRow` to the import list from `"./xvm-api"`, then append:

```ts
describe("FFXIV Venues link API", () => {
  const link: ListingLinkRow = {
    ffxivvenues_id: "abc123",
    linked_at: "2026-09-26T10:00:00Z",
    last_synced_at: null,
    unlinked_at: null,
  }

  it("listMyFfxivListings GETs /ffxivvenues/mine", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [{ id: "abc123", name: "The Lounge", data_center: "Aether", world: "Sargatanas" }] })
    const result = await listMyFfxivListings("token")
    expect(result).toHaveLength(1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/ffxivvenues/mine")
  })

  it("getFfxivLink returns the link row", async () => {
    mockFetchOnce({ ok: true, status: 200, body: link })
    expect(await getFfxivLink("token", "venue-1")).toEqual(link)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/ffxivvenues")
  })

  it("getFfxivLink returns null on 404", async () => {
    mockFetchOnce({ ok: false, status: 404, body: { detail: "not linked" } })
    expect(await getFfxivLink("token", "venue-1")).toBeNull()
  })

  it("getFfxivLink rethrows other errors", async () => {
    mockFetchOnce({ ok: false, status: 502, body: { detail: "upstream" } })
    await expect(getFfxivLink("token", "venue-1")).rejects.toBeInstanceOf(XvmApiError)
  })

  it("linkFfxivListing POSTs the listing id", async () => {
    mockFetchOnce({ ok: true, status: 201, body: { hours_imported: 3, hours_skipped: 0, profile_updated: true, unlinked: false, synced_at: null } })
    await linkFfxivListing("token", "venue-1", "abc123")
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/ffxivvenues/link")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ ffxivvenues_id: "abc123" })
  })

  it("syncFfxivListing POSTs to /sync", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { hours_imported: 3, hours_skipped: 0, profile_updated: false, unlinked: false, synced_at: null } })
    await syncFfxivListing("token", "venue-1")
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/ffxivvenues/sync")
    expect(init.method).toBe("POST")
  })

  it("unlinkFfxivListing DELETEs the link", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" } as unknown as Response)
    await expect(unlinkFfxivListing("token", "venue-1")).resolves.toBeNull()
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/ffxivvenues/link")
    expect(init.method).toBe("DELETE")
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/api/xvm-api.test.ts -t "FFXIV Venues link API"`
Expected: FAIL, the imports don't exist yet.

- [ ] **Step 3: Implement**

Insert after `deleteHours` in `lib/api/xvm-api.ts`:

```ts
// ── FFXIV Venues link API ──────────────────────────────────────

export interface ListingSummary {
  id: string
  name: string
  data_center: string | null
  world: string | null
}

export interface ListingLinkRow {
  ffxivvenues_id: string
  linked_at: string
  last_synced_at: string | null
  unlinked_at: string | null
}

export interface ListingSyncResult {
  hours_imported: number
  hours_skipped: number
  profile_updated: boolean
  unlinked: boolean
  synced_at: string | null
}

export async function listMyFfxivListings(personToken: string): Promise<ListingSummary[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ListingSummary[]>("/ffxivvenues/mine", {}, personToken)
}

export async function getFfxivLink(personToken: string, venueId: string): Promise<ListingLinkRow | null> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  try {
    return await xvmFetch<ListingLinkRow>(`/venues/${venueId}/ffxivvenues`, {}, personToken)
  } catch (err) {
    if (err instanceof XvmApiError && err.status === 404) return null
    throw err
  }
}

export async function linkFfxivListing(
  personToken: string,
  venueId: string,
  ffxivvenuesId: string
): Promise<ListingSyncResult> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ListingSyncResult>(
    `/venues/${venueId}/ffxivvenues/link`,
    { method: "POST", body: JSON.stringify({ ffxivvenues_id: ffxivvenuesId }) },
    personToken
  )
}

export async function syncFfxivListing(personToken: string, venueId: string): Promise<ListingSyncResult> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ListingSyncResult>(`/venues/${venueId}/ffxivvenues/sync`, { method: "POST" }, personToken)
}

export async function unlinkFfxivListing(personToken: string, venueId: string): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/ffxivvenues/link`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/api/xvm-api.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: xvm-api client for the FFXIV Venues link flow"
```

---

### Task 2: Routes

**Files:**
- Create: `app/api/ffxivvenues/mine/route.ts`
- Create: `app/api/venues/[venueId]/ffxivvenues/route.ts`
- Create: `app/api/venues/[venueId]/ffxivvenues/sync/route.ts`

As built, both venue routes share one `authorize()` shape that returns `error: null` on success, so TypeScript narrows `auth.token` to `string` after the error check.

Tier and manager checks stay in xvm-api (403 passes through `xvmApiErrorResponse`), so the routes only authenticate and forward. GET returns `null` for an unlinked venue so the page can tell "not linked" from an error.

- [ ] **Step 1: Picker route**

`app/api/ffxivvenues/mine/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listMyFfxivListings } from "@/lib/api/xvm-api"

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      return NextResponse.json(await listMyFfxivListings(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[ffxivvenues mine] GET error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Link status, link, unlink route**

`app/api/venues/[venueId]/ffxivvenues/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getFfxivLink, linkFfxivListing, unlinkFfxivListing } from "@/lib/api/xvm-api"

const linkSchema = z.object({ ffxivvenuesId: z.string().trim().min(1).max(64) }).strict()

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

type Ctx = { params: Promise<{ venueId: string }> }

async function authorize(context: Ctx | undefined) {
  if (!context?.params) return { error: NextResponse.json({ error: "Invalid request" }, { status: 400 }) }
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  const gate = await requireXvmVenueId((await context.params).venueId)
  if (gate.error) return { error: gate.error }
  return { userId: session.user.id, token, xvmApiVenueId: gate.xvmApiVenueId! }
}

export const GET = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error
    try {
      return NextResponse.json(await getFfxivLink(auth.token, auth.xvmApiVenueId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<Ctx>(
  async (request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error

    let data: z.infer<typeof linkSchema>
    try {
      data = linkSchema.parse(await request.json())
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await linkFfxivListing(auth.token, auth.xvmApiVenueId, data.ffxivvenuesId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)

export const DELETE = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error
    try {
      await unlinkFfxivListing(auth.token, auth.xvmApiVenueId)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues link] DELETE error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 3: Sync route**

`app/api/venues/[venueId]/ffxivvenues/sync/route.ts`: same `requireXvmVenueId`, `Ctx` and `authorize` as Step 2 (copy them, this repo duplicates them per route), with only:

```ts
export const POST = withRateLimit<Ctx>(
  async (_request, context) => {
    const auth = await authorize(context)
    if (auth.error) return auth.error
    try {
      return NextResponse.json(await syncFfxivListing(auth.token, auth.xvmApiVenueId))
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[ffxivvenues sync] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

with `import { syncFfxivListing } from "@/lib/api/xvm-api"` in place of the Step 2 client import.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/ffxivvenues "app/api/venues/[venueId]/ffxivvenues"
git commit -m "feat: routes proxying the xvm-api FFXIV Venues link flow"
```

---

### Task 3: Settings route and page

**Files:**
- Modify: `app/api/venues/[venueId]/settings/route.ts`
- Modify: `app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Settings route, stop reading and writing the link**

In `app/api/venues/[venueId]/settings/route.ts` (line numbers from `88e4f4d5`):
- Line 39: delete `ffxivVenueId: z.string().nullable().optional(),` from the schema.
- GET `select` (lines ~122-126): delete `ffxivVenueId: true,`, `ffxivVenueLinkedAt: true,` and `venueSchedule: { select: { syncedAt: true } },`.
- GET `responseBody` (lines ~139-142): delete `ffxivVenueId`, `ffxivVenueLinkedAt` and `ffxivVenueSyncedAt`.
- PUT destructure (line ~262): delete `ffxivVenueId,`.
- PUT `prisma.venue.update` data (lines ~316-320): delete the whole `...(ffxivVenueId !== undefined && { ... })` spread.
- PUT update `select` (line ~326): delete `ffxivVenueId: true,`.
- Delete the `// If unlinking, remove synced schedule data` block (lines ~331-333).
- `putResponseBody` (line ~339): delete `ffxivVenueId: updatedVenue.ffxivVenueId,`.

- [ ] **Step 2: Settings page state**

In `settings/page.tsx`, replace lines 89-97 (`ffxivVenueId` through `ffxivUnlinking`) with:

```tsx
  const [ffxivLink, setFfxivLink] = useState<ListingLinkRow | null>(null)
  const [ffxivListings, setFfxivListings] = useState<ListingSummary[] | null>(null)
  const [ffxivSelected, setFfxivSelected] = useState("")
  const [ffxivLoading, setFfxivLoading] = useState(false)
  const [ffxivError, setFfxivError] = useState<string | null>(null)
  const [ffxivSyncing, setFfxivSyncing] = useState(false)
  const [ffxivUnlinking, setFfxivUnlinking] = useState(false)
```

Add to the file's imports: `import type { ListingLinkRow, ListingSummary } from "@/lib/api/xvm-api"` (merge into an existing xvm-api type import if there is one).

Delete the three `setFfxivVenue*` calls at lines 199-201.

Next to the `loadPotSettings(venue.id)` call, add:

```tsx
        if (venue.xvmApiVenueId) {
          fetch(`/api/venues/${venue.id}/ffxivvenues`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: ListingLinkRow | null) => setFfxivLink(data && !data.unlinked_at ? data : null))
            .catch(() => setFfxivLink(null))
        }
```

- [ ] **Step 3: Settings page handlers**

Replace `handleFfxivPreview`, `handleFfxivLink`, `handleFfxivSyncNow` and `handleFfxivUnlink` (lines ~372-448) with:

```tsx
  async function handleFfxivLoadListings() {
    setFfxivLoading(true)
    setFfxivError(null)
    try {
      const res = await fetch("/api/ffxivvenues/mine")
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Failed to load your listings")
      setFfxivListings(body as ListingSummary[])
      setFfxivSelected((body as ListingSummary[])[0]?.id ?? "")
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to load your listings")
    } finally {
      setFfxivLoading(false)
    }
  }

  async function handleFfxivLink() {
    if (!ffxivSelected) return
    setFfxivLoading(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ffxivvenuesId: ffxivSelected }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Failed to link")
      const linkRes = await fetch(`/api/venues/${venueId}/ffxivvenues`)
      setFfxivLink(linkRes.ok ? await linkRes.json() : null)
      setFfxivListings(null)
      setFfxivSelected("")
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to link")
    } finally {
      setFfxivLoading(false)
    }
  }

  async function handleFfxivSyncNow() {
    setFfxivSyncing(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues/sync`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Sync failed")
      if (body?.unlinked) {
        setFfxivLink(null)
        return
      }
      setFfxivLink((prev) => (prev ? { ...prev, last_synced_at: body?.synced_at ?? new Date().toISOString() } : prev))
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setFfxivSyncing(false)
    }
  }

  async function handleFfxivUnlink() {
    setFfxivUnlinking(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to unlink")
      }
      setFfxivLink(null)
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to unlink")
    } finally {
      setFfxivUnlinking(false)
    }
  }
```

- [ ] **Step 4: Settings page JSX**

In the ffxivvenues.com `introw` (lines ~985-1095):
- `{ffxivVenueId && (` becomes `{ffxivLink && (` for the Linked badge.
- The description `Sync your schedule from your ffxivvenues.com listing` becomes `Import your profile and hours from your ffxivvenues.com listing`.
- The inner conditional `{ffxivVenueId ? (` becomes `{!xvmApiVenueId ? (<p className="text-xs text-[var(--fg-faint)]">Connect this venue to xvm-api first.</p>) : ffxivLink ? (`.
- `ffxivVenueSyncedAt` becomes `ffxivLink.last_synced_at` in the "Last synced" line (both the guard and the `LocalTime`).
- The unlink dialog description becomes `The hours imported from your listing will be removed from your profile.`
- Replace the whole `ffxivPreview ? (...) : (...)` tail with the picker:

```tsx
                  ) : ffxivListings ? (
                    ffxivListings.length === 0 ? (
                      <p className="text-xs text-[var(--fg-faint)]">
                        No listings found. Ask to be added as a manager on{" "}
                        <a
                          href="https://ffxivvenues.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--xiv-blue)] hover:underline"
                        >
                          ffxivvenues.com
                        </a>
                        , then try again.
                      </p>
                    ) : (
                      <>
                        <select
                          value={ffxivSelected}
                          onChange={(e) => setFfxivSelected(e.target.value)}
                          className="w-full rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                        >
                          {ffxivListings.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                              {l.world ? ` (${l.world})` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-[var(--fg-faint)]">
                          Linking imports the listing&apos;s name, description, location, banner and hours onto your
                          venue profile.
                        </p>
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="outline-blue"
                            size="sm"
                            onClick={handleFfxivLink}
                            disabled={ffxivLoading || !ffxivSelected}
                          >
                            {ffxivLoading ? "Linking…" : "Import and link"}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFfxivListings(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="outline-blue"
                      size="sm"
                      onClick={handleFfxivLoadListings}
                      disabled={ffxivLoading}
                    >
                      {ffxivLoading ? "Loading…" : "Find my listings"}
                    </Button>
                  )}
                  {ffxivError && <p className="text-xs text-red-400">{ffxivError}</p>}
```

The original `ffxivPreviewError` line and the "Find your venue ID at ffxivvenues.com" paragraph go away with the block they were in.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && pnpm run lint`
Expected: no errors. A leftover `ffxivVenueId` reference in the page means a step above was missed.

- [ ] **Step 6: Commit**

```bash
git add "app/api/venues/[venueId]/settings/route.ts" "app/dashboard/[slug]/settings/page.tsx"
git commit -m "feat: settings link picker reads and writes xvm-api"
```

---

### Task 4: Public venues, drop `ffxivVenuesId` (pending decision 1)

**Files:**
- Modify: `app/api/public/venues/route.ts`

- [ ] **Step 1:** Delete `ffxivVenueId: true,` from the `select` (line 28) and `ffxivVenuesId: v.ffxivVenueId,` from the mapped object (line 91).
- [ ] **Step 2:** Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit**

```bash
git add app/api/public/venues/route.ts
git commit -m "fix: public venues stops exposing a Prisma-only ffxivVenuesId

xvm-api's public venue batch carries no listing id, and no known consumer
reads the field."
```

---

### Task 5: Delete the Prisma-side sync

**Files:**
- Delete: `lib/ffxivvenues.ts`
- Delete: `app/api/venues/[venueId]/sync-ffxivvenues/route.ts`
- Delete: `app/api/cron/sync-ffxivvenues-schedule/route.ts`
- Modify: `docker-compose.yml` (remove the `sync-ffxivvenues-schedule` crond line)

- [ ] **Step 1: Confirm nothing still imports them**

Run: `grep -rnE "lib/ffxivvenues|sync-ffxivvenues|syncAllFfxivVenues|syncFfxivVenue|fetchFfxivVenue" --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=.next .`
Expected: only the three files themselves. An empty grep for a caller means no caller.

- [ ] **Step 2: Delete and verify**

```bash
git rm lib/ffxivvenues.ts "app/api/venues/[venueId]/sync-ffxivvenues/route.ts" app/api/cron/sync-ffxivvenues-schedule/route.ts
npx tsc --noEmit && pnpm run lint && npx vitest run
```

Expected: no type errors, 0 lint errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove the dashboard-side FFXIV Venues sync

xvm-api re-syncs linked venues every two hours itself. The crond line
in docker-compose.yml goes with it."
```

---

### Task 6: Live check

Per `CLAUDE.md`, static checks are not enough.

- [ ] Start the local stack (`docs/LOCAL_DEV.md`), pointed at a dev xvm-api (`xvm_api_dev`), never prod.
- [ ] Settings, unlinked venue: "Find my listings" shows the caller's listings, or the empty-state message.
- [ ] Pick one and import: badge shows Linked, Last synced fills in, the venue name and hours change to the listing's, and the Hours page shows the rows read-only (PR 1).
- [ ] Sync now: the timestamp moves. Unlink: the badge clears and the imported hours are gone.
- [ ] A non-owner (Manager) sees the API's 403 message on link, not a crash.
- [ ] A venue with no `xvmApiVenueId` shows "Connect this venue to xvm-api first."

---

## Not in this PR

- Dropping `ffxivVenueId`, `ffxivVenueLinkedAt`, `ffxivVenueLinkedBy` and the `VenueSchedule` table from Prisma: PR 3, after a backup.
- Migrating existing prod links: belongs to the prod cutover script (no prod xvm-api DB yet).
- Import-on-create at `venues/new` (`POST /venues/from-ffxivvenues`): optional PR 4.
- Recreating the crond container on deploy so the removed line takes effect: ops step.

## Self-review

- Spec coverage: client (T1), status, picker, link, sync and unlink routes (T2), Settings UI plus Prisma cutover (T3), public venues (T4), deletions (T5), live check (T6). Prisma column removal is deliberately PR 3.
- Placeholders: none. Line numbers in T3 and T4 are from `88e4f4d5`.
- Type names: `ListingSummary`, `ListingLinkRow`, `ListingSyncResult` and the five function names are consistent across T1, T2 and T3.
