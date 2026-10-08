# Venue Creation on xvm-api Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create venues in xvm-api first, so every new venue is born connected and owned in xvm-api, with no Prisma membership, no Prisma role, and no manual "connect" step.

**Architecture:** `POST /api/venues` calls xvm-api's `POST /venues` (the caller becomes owner in the same transaction), sends the profile fields xvm-api's create call does not take in a second call, then writes a Prisma `Venue` row that exists only as the dashboard's id and slug bridge. The connect route, its button and the Prisma Manager-role helper are deleted.

**Tech Stack:** Next.js route handlers, TypeScript, zod, Prisma (bridge row only), vitest, xvm-api `POST /venues` and `PATCH /venues/{id}`.

---

Status: proposed, 2026-10-08. Nothing built yet.

## Why this comes first

The end state is that every venue lives in xvm-api and Prisma is removed entirely. Today a venue is born the other way round: `POST /api/venues` writes the venue, an owner membership and a Manager role to Prisma only, and an xvm-api venue appears later, when the owner presses "Connect to xvm-api" in settings (`xvm-connect`, whose only caller is that button). So every new venue starts unconnected, and the dashboard needs a transitional "unconnected" state: 105 places in `app/` and `lib/` branch on `xvmApiVenueId` being null, and the membership-gates plan (#136) would have needed an owner-by-`ownerId` rule just to let a new venue's creator reach the connect button.

Cutting creation over removes that state at its source. After this lands, a new venue can never be unconnected, #136 needs no special case, and the connect route and button go. **It cannot ship alone:** see "Shipping order" below.

## The test applied to every choice

Prisma is removed entirely at the end. So each choice here is checked against: does this add Prisma reads or writes, and is what remains deleted cleanly with the bridge? This slice **removes** two Prisma writes (the owner membership and the Manager role) and **keeps** one, the venue row, because the rest of the dashboard still resolves a venue through it (about 130 reads) and four readers still take profile columns from it.

## What exists today, so nothing is missed

| Piece | Today | After this plan |
|---|---|---|
| Venue row | created in Prisma | still created, as a bridge, after xvm-api |
| Owner | Prisma `Membership` (`OWNER`) | xvm-api owner membership, made by `POST /venues` |
| Manager role | `ensureManagerRole` writes a Prisma `Role` for the plugin's strict role filter | not written; `lib/api/venue-setup.ts` deleted (its only caller) |
| Profile fields (description, district, ward, plot, apartment) | written to Prisma | sent to xvm-api with `PATCH /venues/{id}`; also kept on the bridge row (decision 1) |
| xvm-api venue | created later by `xvm-connect` | created first |
| Side effects (Discord feed, welcome email, admin alert email, venue-list cache) | after the transaction | unchanged |

Two contract details found by reading both sides:

- **The dashboard's `apartment` is xvm-api's `room`.** The existing `PATCH /api/venues/[venueId]` already maps it (`...(apartment !== undefined && { room: apartment })`) and says xvm-api's own `apartment` field is unrelated and never written. Creation must do the same.
- **Slug length.** The dashboard allows up to 100 characters; xvm-api's create call allows 50 (`MAX_NAME_LENGTH // 2`). A 51 to 100 character slug passes today's validation and would be refused by xvm-api. Creation tightens the dashboard limit to 50.

All other constraints match (name 100, ward 1 to 30, plot 1 to 60, slug pattern `^[a-z0-9-]+$`).

## Decisions

1. **The bridge row keeps the profile columns it carries today.** The landing page card, the discover pages, the following page and a cron still read `description`, `district`, `ward` and `plot` from Prisma. If the bridge row were minimal, a new venue would show blank details there. Editing a venue already writes xvm-api only, so those columns go stale after any edit; this is the existing stale-read problem, not a new one. They are deleted with the bridge when the readers move.
2. **A failed profile update is not fatal.** xvm-api has no delete for a venue, so failing the request after the venue exists would leave an orphan and a user who cannot retry (the slug is taken). The route still creates the bridge row, answers 201 with `profileSaved: false`, and the form sends the person to Settings, where the same fields can be entered.
3. **New venues have no Prisma membership or role, so the plugin cannot see them yet.** The plugin cutover is deferred, and this code reaches prod only at the maintenance window, after the migration, so prod is unaffected. On `dev` a plugin pointed at a newly created venue will not find its role until the plugin routes move.
4. **Existing unconnected `dev` venues have no way to connect once the button is gone.** The `dev` database is disposable. Delete them or reset it. Under the membership-gates plan they would be unreachable anyway.
5. **Slug limit 50**, to match xvm-api.

## Not in this plan

- **Deleting a venue.** `DELETE /api/venues/[venueId]` deletes the Prisma row only and leaves the xvm-api venue and its memberships behind. That is already true for every connected venue. A follow-up should deactivate the venue in xvm-api (`set_active` exists).
- **The 105 `xvmApiVenueId`-is-null branches.** They become dead on `dev` once unconnected venues are gone. Removing them is a cleanup slice after the migration.
- **Moving the four profile readers off Prisma** (landing, discover, following, the event-status cron). That is what lets creation stop writing the profile columns.
- **The hard-coded admin address in the alert email** and `postNewVenue`. Unchanged.

## File structure

| File | Change |
|---|---|
| `apps/web/app/api/venues/route.ts` | Replace the imports, schema and `POST`. `GET` is untouched (the membership-gates plan edits it). |
| `apps/web/app/api/venues/route.test.ts` | New. There is no test for venue creation today. |
| `apps/web/app/venues/new/page.tsx` | One line: where to go after creating. |
| `apps/web/app/api/venues/[venueId]/xvm-connect/route.ts` | Delete. |
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Remove the connect handler, its two state variables and the button. |
| `apps/web/lib/api/venue-setup.ts` | Delete. |

## Shipping order

**This ships together with the membership-gates work (#136), not before it.** Found in a browser on 2026-10-08: a venue created by slice A has no Prisma membership, and 13 dashboard pages, the venue list and 27 API routes still decide access by a Prisma membership, so the creator gets a 404 on their own venue's dashboard. In the other direction, #136 alone makes a venue created the old way (a Prisma membership, no xvm-api venue) unreachable. Either order leaves newly created venues unusable until both are in.

Recommended: merge the #136 stack first (it also fixes invited members, who are refused today), then #139 and #140, in one sitting, and create no venues in between. `dev` deploys itself on push, so the window is real. The alternative, keeping a Prisma owner membership in creation until #136 lands, would reintroduce the transitional state this plan exists to remove.

## PR slices

Both against `dev`, and neither ships alone (see "Shipping order"). The membership-gates PRs touch `app/api/venues/route.ts` (`GET`) too, so whichever lands second rebases.

| PR | Tasks |
|---|---|
| A | Tasks 1 and 2 |
| B | Task 3 |

---

### Task 1: Create the venue in xvm-api first

**Files:**
- Modify: `apps/web/app/api/venues/route.ts` (everything above `export const GET`)
- Test: `apps/web/app/api/venues/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  venueFindUnique: vi.fn(),
  venueCreate: vi.fn(),
  invalidate: vi.fn(),
  postNewVenue: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFindUnique, create: m.venueCreate } } }))
vi.mock("@/lib/redis-cache", () => ({
  invalidateCache: m.invalidate,
  getOrSet: vi.fn(),
  cacheKeys: { userVenues: (id: string) => `user:${id}:venues` },
  cacheTTL: { venue: 300 },
}))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ createVenue: m.createVenue, updateVenue: m.updateVenue }))
vi.mock("@/lib/discord-feed", () => ({ postNewVenue: m.postNewVenue }))
vi.mock("@/lib/email", () => ({ sendEmail: m.sendEmail }))
vi.mock("@/lib/email-templates", () => ({ venueWelcomeEmail: () => ({}), newVenueAlertEmail: () => ({}) }))

import { POST } from "@/app/api/venues/route"

const valid = {
  name: "The Velvet Lotus",
  slug: "velvet-lotus",
  description: "Cocktails and dancing",
  dataCenter: "Crystal",
  world: "Balmung",
  district: "Mist",
  ward: 12,
  plot: 7,
}

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1", email: "owner@example.test", name: "Owner" } })
  m.venueFindUnique.mockResolvedValue(null)
  m.token.mockResolvedValue("tok")
  m.createVenue.mockResolvedValue({ id: "ven_1", name: "The Velvet Lotus", slug: "velvet-lotus", data_center: "Crystal", world: "Balmung" })
  m.updateVenue.mockResolvedValue({})
  m.venueCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", ...data }))
  m.sendEmail.mockResolvedValue(undefined)
})

describe("POST /api/venues", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(401)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("rejects invalid input before calling anything", async () => {
    expect((await post({ ...valid, name: "" })).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("rejects a slug longer than xvm-api accepts", async () => {
    expect((await post({ ...valid, slug: "a".repeat(51) })).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("refuses a slug the bridge table already has, before touching xvm-api", async () => {
    m.venueFindUnique.mockResolvedValue({ id: "existing" })
    expect((await post(valid)).status).toBe(400)
    expect(m.createVenue).not.toHaveBeenCalled()
  })

  it("answers 503 and creates nothing when there is no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await post(valid)).status).toBe(503)
    expect(m.createVenue).not.toHaveBeenCalled()
    expect(m.venueCreate).not.toHaveBeenCalled()
  })

  it("creates the venue in xvm-api first and writes only a bridge row to Prisma", async () => {
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.createVenue).toHaveBeenCalledWith("tok", {
      name: "The Velvet Lotus",
      slug: "velvet-lotus",
      data_center: "Crystal",
      world: "Balmung",
    })
    const { data } = m.venueCreate.mock.calls[0][0]
    expect(data).toMatchObject({ slug: "velvet-lotus", ownerId: "u1", xvmApiVenueId: "ven_1", xvmApiVenueLinkedBy: "u1" })
    expect(data.xvmApiVenueLinkedAt).toBeInstanceOf(Date)
    expect(data).not.toHaveProperty("memberships")
    expect(await res.json()).toMatchObject({ slug: "velvet-lotus", profileSaved: true })
  })

  it("sends the profile fields xvm-api's create call does not take", async () => {
    await post(valid)
    expect(m.updateVenue).toHaveBeenCalledWith("tok", "ven_1", {
      description: "Cocktails and dancing",
      district: "Mist",
      ward: 12,
      plot: 7,
    })
  })

  it("maps the dashboard's apartment number to xvm-api's room, never to its apartment", async () => {
    await post({ ...valid, plot: undefined, apartment: 3 })
    const [, , update] = m.updateVenue.mock.calls[0]
    expect(update).toMatchObject({ room: 3 })
    expect(update).not.toHaveProperty("apartment")
    expect(update).not.toHaveProperty("plot")
  })

  it("skips the profile call when there are no profile fields", async () => {
    await post({ name: valid.name, slug: valid.slug, dataCenter: valid.dataCenter, world: valid.world })
    expect(m.updateVenue).not.toHaveBeenCalled()
  })

  it("still creates the bridge row, and says the profile was not saved, when that call fails", async () => {
    m.updateVenue.mockRejectedValue(new Error("down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await post(valid)
    expect(res.status).toBe(201)
    expect(m.venueCreate).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ profileSaved: false })
  })

  it("forwards xvm-api's refusal and writes nothing to Prisma", async () => {
    m.createVenue.mockRejectedValue(new Error("slug taken"))
    m.errorResponse.mockResolvedValue(NextResponse.json({ error: "A venue with this slug already exists." }, { status: 409 }))
    const res = await post(valid)
    expect(res.status).toBe(409)
    expect(m.venueCreate).not.toHaveBeenCalled()
  })

  it("logs the orphaned xvm-api venue and answers 500 when the bridge row cannot be written", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    m.venueCreate.mockRejectedValue(new Error("unique violation"))
    expect((await post(valid)).status).toBe(500)
    expect(log.mock.calls.some((call) => String(call[0]).includes("orphaned xvm-api venue ven_1"))).toBe(true)
  })

  it("refreshes the person's venue list and fires the Discord feed", async () => {
    await post(valid)
    expect(m.invalidate).toHaveBeenCalledWith("user:u1:venues")
    expect(m.postNewVenue).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `pnpm exec vitest run app/api/venues/route.test.ts`
Expected: FAIL. The old route never calls `createVenue`, so the xvm-api assertions fail, and it still imports `venue-setup`, which needs a Prisma transaction the mock does not provide.

- [ ] **Step 3: Replace the top of the route**

In `app/api/venues/route.ts`, replace everything above `export const GET` (the imports, `venueSchema` and the `POST` handler) with:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getOrSet, cacheKeys, cacheTTL, invalidateCache } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createVenue, updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"
import { sendEmail } from "@/lib/email"
import { venueWelcomeEmail, newVenueAlertEmail } from "@/lib/email-templates"
import { postNewVenue } from "@/lib/discord-feed"

const venueSchema = z.object({
  name: validators.venueName,
  slug: validators.slug.max(50, "Slug too long (max 50 characters)"),
  description: validators.venueDescription,
  dataCenter: z.string().min(1, "Data center is required").max(50, "Data center name too long"),
  world: z.string().min(1, "World is required").max(50, "World name too long"),
  district: validators.venueDistrict,
  ward: validators.venueWard,
  plot: validators.venuePlot,
  apartment: validators.venueApartment,
})

export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const body = await request.json()
      const validatedData = venueSchema.parse(body)

      const existingVenue = await prisma.venue.findUnique({
        where: { slug: validatedData.slug },
      })

      if (existingVenue) {
        return NextResponse.json({ error: "A venue with this slug already exists" }, { status: 400 })
      }

      const userId = session.user.id
      const token = await getValidXvmApiToken(userId)
      if (!token) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }

      let created
      try {
        created = await createVenue(token, {
          name: validatedData.name,
          slug: validatedData.slug,
          data_center: validatedData.dataCenter,
          world: validatedData.world,
        })
      } catch (err) {
        return xvmApiErrorResponse(err, userId, "[venue create] xvm-api create error")
      }

      const profile: VenueUpdate = {}
      if (validatedData.description) profile.description = validatedData.description.trim()
      if (validatedData.district) profile.district = validatedData.district.trim()
      if (validatedData.ward != null) profile.ward = validatedData.ward
      if (validatedData.plot != null) profile.plot = validatedData.plot
      if (validatedData.apartment != null) profile.room = validatedData.apartment

      let profileSaved = true
      if (Object.keys(profile).length > 0) {
        try {
          await updateVenue(token, created.id, profile)
        } catch (err) {
          profileSaved = false
          console.error(`[venue create] profile update failed for xvm-api venue ${created.id}:`, err)
        }
      }

      const venue = await prisma.venue
        .create({
          data: {
            name: validatedData.name,
            slug: validatedData.slug,
            description: validatedData.description,
            dataCenter: validatedData.dataCenter,
            world: validatedData.world,
            district: validatedData.district ?? null,
            ward: validatedData.ward ?? null,
            plot: validatedData.plot ?? null,
            apartment: validatedData.apartment ?? null,
            ownerId: userId,
            xvmApiVenueId: created.id,
            xvmApiVenueLinkedAt: new Date(),
            xvmApiVenueLinkedBy: userId,
          },
        })
        .catch((err: unknown) => {
          console.error(`[venue create] bridge row failed; orphaned xvm-api venue ${created.id}:`, err)
          throw err
        })

      await invalidateCache(cacheKeys.userVenues(userId))

      postNewVenue(venue)

      const ownerEmail = session.user.email
      if (ownerEmail) {
        sendEmail({
          to: ownerEmail,
          ...venueWelcomeEmail({ venueName: venue.name, slug: venue.slug, ownerName: session.user.name }),
        }).catch(() => {})

        sendEmail({
          to: "rgcsubsonik@gmail.com",
          ...newVenueAlertEmail({
            venueName: venue.name,
            slug: venue.slug,
            ownerEmail,
            dataCenter: venue.dataCenter,
            world: venue.world,
          }),
        }).catch(() => {})
      }

      return NextResponse.json({ ...venue, profileSaved }, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error creating venue:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)

```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/api/venues/route.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint app/api/venues/route.ts app/api/venues/route.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/venues/route.ts apps/web/app/api/venues/route.test.ts
git commit -m "Create venues in xvm-api first, with only a bridge row in Prisma"
```

---

### Task 2: Where the form goes next

**Files:**
- Modify: `apps/web/app/venues/new/page.tsx` (line 90)

- [ ] **Step 1: Send the person to Settings when their details were not saved**

Replace:

```ts
      const venue = await response.json()
      router.push(`/dashboard/${venue.slug}`)
```

with:

```ts
      const venue = await response.json()
      router.push(venue.profileSaved === false ? `/dashboard/${venue.slug}/settings` : `/dashboard/${venue.slug}`)
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint app/venues/new/page.tsx`
Expected: no errors. Then create a venue through the form on a local stack and confirm it lands on the dashboard. If a local Discord sign-in is not available, say so in the PR; Task 4 covers the API half.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/venues/new/page.tsx
git commit -m "Send a new venue's owner to Settings when their details were not saved"
```

---

### Task 3: Remove the connect step

**Files:**
- Delete: `apps/web/app/api/venues/[venueId]/xvm-connect/route.ts`
- Delete: `apps/web/lib/api/venue-setup.ts`
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Delete the route and the role helper**

```bash
git rm "apps/web/app/api/venues/[venueId]/xvm-connect/route.ts" apps/web/lib/api/venue-setup.ts
```

`ensureManagerRole` had one caller, the creation route, which no longer imports it. Run `grep -rn "venue-setup\|xvm-connect" apps/web --include=*.ts --include=*.tsx` afterwards; the only hit should be `settings/page.tsx`, handled next.

- [ ] **Step 2: Remove the handler and its state from settings**

In `app/dashboard/[slug]/settings/page.tsx`, delete these two lines (around 101-102):

```ts
  const [xvmConnecting, setXvmConnecting] = useState(false)
  const [xvmConnectError, setXvmConnectError] = useState<string | null>(null)
```

and delete the whole `handleXvmConnect` function (around 468-486):

```ts
  async function handleXvmConnect() {
    setXvmConnecting(true)
    setXvmConnectError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/xvm-connect`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to connect")
      }
      const result = await res.json()
      setXvmApiVenueId(result.id)
      setXvmApiVenueLinkedAt(new Date().toISOString())
      loadPotSettings(venueId).catch(() => {})
    } catch (e) {
      setXvmConnectError(e instanceof Error ? e.message : "Failed to connect")
    } finally {
      setXvmConnecting(false)
    }
  }
```

- [ ] **Step 3: Replace the connect button**

In the xvm-api status block (around 1235-1244), replace:

```tsx
                      <>
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={handleXvmConnect}
                          disabled={xvmConnecting}
                        >
                          {xvmConnecting ? "Connecting…" : "Connect to xvm-api"}
                        </Button>
                        {xvmConnectError && <p className="text-xs text-red-400">{xvmConnectError}</p>}
                      </>
```

with:

```tsx
                      <p className="text-xs text-[var(--fg-faint)]">
                        Not connected. Venues are created in xvm-api now, so this one predates that.
                      </p>
```

Leave `xvmApiVenueId`, `xvmApiVenueLinkedAt` and the "Connected" display as they are; the rest of the null-branch cleanup is a later slice.

- [ ] **Step 4: Move `loadPotSettings` above the settings effect**

`handleXvmConnect` was the only later caller of `loadPotSettings`. With it gone, the load effect near the top of the component is the only caller, and it comes before the function's declaration, which the React compiler lint rule (`react-hooks/immutability`) reports as "Cannot access variable before it is declared". It is an error, not a warning, and the page had none before. Move the function above the effect. It only uses state setters declared at the top, so nothing else changes.

Delete this from where it is now (just above `handleFroggeConnect`, around line 457):

```ts
  async function loadPotSettings(id: string) {
    const r = await fetch(`/api/venues/${id}/pot-settings`, { signal: AbortSignal.timeout(SETTINGS_LOAD_TIMEOUT_MS) })
    if (!r.ok) return
    const data = await r.json()
    setPotTaxPercent(data.settings.taxPercent)
    setPotIncludeSalesInPot(data.settings.includeSalesInPot)
    setPotDefaultTipPooled(data.settings.defaultTipPooled)
  }
```

and put the same text, followed by a blank line, directly above the `  // Fetch settings` comment (around line 135).

- [ ] **Step 5: Typecheck, lint, run the suite**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: tsc clean, no new lint errors (the settings page shows its 5 existing warnings and no error), and the full suite passes. A leftover `Button` import is fine if `Button` is still used elsewhere in the file; the compiler and lint will say if it is not.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/app apps/web/lib
git commit -m "Remove the manual connect step now that venues are created in xvm-api"
```

---

### Task 4: Acceptance check against a real xvm-api

The route test mocks xvm-api, so it cannot show the two systems agree. Run this once on the local stack from the membership-gates plan's appendix (Postgres with the Prisma schema, a local xvm-api on `dev`, a service credential). Throwaway file, never committed.

`apps/web/repro-create.test.ts`:

```ts
import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.XVM_API_BASE_URL = "http://127.0.0.1:8000"
})

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "user-ann", email: "ann@example.test", name: "Creator Ann" } }),
  default: () => ({}),
}))
vi.mock("@/lib/discord-feed", () => ({ postNewVenue: () => {} }))
vi.mock("@/lib/email", () => ({ sendEmail: async () => {} }))

import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { POST } from "@/app/api/venues/route"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const xvm = (path: string, token: string) =>
  fetch(`http://127.0.0.1:8000${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json())

describe("venue creation against a real xvm-api", () => {
  it("makes the creator the owner in xvm-api and leaves no Prisma membership", async () => {
    await prisma.user.upsert({ where: { id: "user-ann" }, update: {}, create: { id: "user-ann", name: "Creator Ann", email: "ann@example.test" } })
    const exchange = await fetch("http://127.0.0.1:8000/internal/tokens/exchange", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.XVM_API_DASHBOARD_SERVICE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "discord", external_id: "910000000000000001", display_name: "Creator Ann" }),
    }).then((res) => res.json())
    await prisma.xvmApiCredential.upsert({
      where: { userId: "user-ann" },
      update: { token: exchange.secret, credentialId: exchange.credential.id, expiresAt: new Date(exchange.credential.expires_at) },
      create: { userId: "user-ann", token: exchange.secret, credentialId: exchange.credential.id, expiresAt: new Date(exchange.credential.expires_at) },
    })

    const res = await POST(
      new NextRequest("http://localhost/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Created Venue", slug: "created-venue", description: "Made through the route", dataCenter: "Light", world: "Twintania",
          district: "Mist", ward: 5, apartment: 3,
        }),
      })
    )
    const created = await res.json()
    expect(res.status).toBe(201)
    expect(created.profileSaved).toBe(true)

    const mine = (await xvm("/me/venues", exchange.secret)) as { venue: { id: string; slug: string }; tier: string }[]
    const row = mine.find((entry) => entry.venue.slug === "created-venue")!
    expect(row.tier).toBe("owner")

    const detail = await xvm(`/venues/${row.venue.id}`, exchange.secret)
    expect(detail).toMatchObject({ description: "Made through the route", district: "Mist", ward: 5, room: 3 })

    expect(created.xvmApiVenueId).toBe(row.venue.id)
    expect(await prisma.membership.count({ where: { venueId: created.id } })).toBe(0)
    expect(await prisma.role.count({ where: { venueId: created.id } })).toBe(0)
  })
})
```

Run it from `apps/web` with the same environment variables as the membership-gates appendix, plus `pnpm exec vitest run repro-create.test.ts --disable-console-intercept`. Expected: PASS. Then delete the file. Tear the stack down as in that appendix.

## Follow-ups

- Move the four profile readers (landing page card, discover, following, the event-status cron) to xvm-api, then stop writing the profile columns on the bridge row.
- Deactivate the xvm-api venue when a venue is deleted.
- Remove the 105 `xvmApiVenueId`-is-null branches once `dev` has no unconnected venues.
- When the membership-gates plan lands after this, delete its unconnected-venue owner rule. That edit is made in that plan, not here.
