# Account Deletion Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Danger zone's immediate Prisma delete with xvm-api's `DELETE /me`, which has a 30 day grace period and refuses unpaid payroll and a last owner.

**Architecture:** A `requestAccountDeletion` helper in `lib/api/xvm-api.ts`; a new `DELETE /api/user/deletion` route that uses the stored xvm-api token, like the other person-scoped routes; a pure `lib/account-deletion.ts` that turns the route's response into a UI state (the package has no jsdom, so the decisions live in a testable `lib/` file); the settings page renders that state. The old `app/api/user/account/route.ts` is deleted. The Prisma user row is left alone.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching route conventions, see `apps/web/AGENTS.md`), TypeScript strict, vitest (node environment), shadcn AlertDialog.

**Spec:** `docs/superpowers/specs/2026-10-27-account-deletion-screen-design.md`. Depends on xvm-api#217 being deployed and on xvm-dashboard#284.

**Conventions to hold to:** no inline comments that explain WHAT; no em dashes in user-facing text; match surrounding style (no Prettier yet); one worktree (`~/xvm-dashboard-delete-account`, branch `feat/account-deletion-screen`). Run commands from `apps/web` unless stated.

> **Superseded in part:** the accepted state described here (a scheduled-date card with a Sign out button) was replaced by signing the deleting tab out at once. See `docs/superpowers/plans/2026-10-27-end-session-on-pending-deletion.md`.

---

## File map

- Modify `apps/web/lib/api/xvm-api.ts`: add `AccountDeletion` and `requestAccountDeletion` after `updateMyDisplayName` (line 338).
- Create `apps/web/lib/api/xvm-api-deletion.test.ts`: request-shape test, same style as `xvm-api-pairing.test.ts`.
- Create `apps/web/lib/account-deletion.ts` and `apps/web/lib/account-deletion.test.ts`: response to UI state.
- Create `apps/web/app/api/user/deletion/route.ts` and `route.test.ts`.
- Delete `apps/web/app/api/user/account/route.ts`.
- Modify `apps/web/app/dashboard/account/settings/page.tsx`: the Danger zone card (lines 231-269) and its state.

---

### Task 1: xvm-api helper

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (after line 341)
- Create: `apps/web/lib/api/xvm-api-deletion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubGlobal("fetch", vi.fn())
})

const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

describe("requestAccountDeletion", () => {
  it("deletes /me with the person's token and returns the grace period", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      reply({ requested_at: "2026-10-27T09:00:00Z", anonymises_at: "2026-11-26T09:00:00Z" }, 202)
    )
    const { requestAccountDeletion } = await import("./xvm-api")
    const deletion = await requestAccountDeletion("tok")
    expect(deletion.anonymises_at).toBe("2026-11-26T09:00:00Z")
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://xvm.test/me")
    expect((init as RequestInit).method).toBe("DELETE")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
  })

  it("throws an XvmApiError carrying the refusal text on a 409", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ detail: "Unpaid payroll at Velvet Rift." }, 409))
    const { requestAccountDeletion, XvmApiError, xvmErrorMessage } = await import("./xvm-api")
    const err = await requestAccountDeletion("tok").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(XvmApiError)
    expect((err as InstanceType<typeof XvmApiError>).status).toBe(409)
    expect(xvmErrorMessage(err as InstanceType<typeof XvmApiError>)).toContain("Unpaid payroll at Velvet Rift.")
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/api/xvm-api-deletion.test.ts`
Expected: FAIL, `requestAccountDeletion is not a function`.

- [ ] **Step 3: Implement**

Insert after `updateMyDisplayName` in `lib/api/xvm-api.ts`:

```ts
export interface AccountDeletion {
  requested_at: string
  anonymises_at: string
}

export async function requestAccountDeletion(personToken: string): Promise<AccountDeletion> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<AccountDeletion>("/me", { method: "DELETE" }, personToken)
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run lib/api/xvm-api-deletion.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api-deletion.test.ts
git commit -m "Add requestAccountDeletion for xvm-api DELETE /me"
```

---

### Task 2: Response to UI state

**Files:**
- Create: `apps/web/lib/account-deletion.ts`
- Create: `apps/web/lib/account-deletion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"

import { DELETION_FAILED, deletionOutcome } from "./account-deletion"

describe("deletionOutcome", () => {
  it("is scheduled on a 200, with the day the account is anonymised", () => {
    expect(deletionOutcome(200, { anonymisesAt: "2026-11-26T09:00:00Z" })).toEqual({
      kind: "scheduled",
      anonymisesOn: "26 November 2026",
    })
  })

  it("keeps the refusal text of a 409, so the person can fix what blocks it", () => {
    expect(deletionOutcome(409, { error: "Unpaid payroll at Velvet Rift." })).toEqual({
      kind: "refused",
      message: "Unpaid payroll at Velvet Rift.",
    })
  })

  it("is a failure, with the route's message, on a 503", () => {
    expect(deletionOutcome(503, { error: "xvm-api request failed" })).toEqual({
      kind: "failed",
      message: "xvm-api request failed",
    })
  })

  it("falls back to a generic failure when the body has no message or is not JSON", () => {
    expect(deletionOutcome(500, null)).toEqual({ kind: "failed", message: DELETION_FAILED })
    expect(deletionOutcome(409, {})).toEqual({ kind: "refused", message: DELETION_FAILED })
  })

  it("does not call a 200 without a date scheduled", () => {
    expect(deletionOutcome(200, {})).toEqual({ kind: "failed", message: DELETION_FAILED })
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/account-deletion.test.ts`
Expected: FAIL, cannot resolve `./account-deletion`.

- [ ] **Step 3: Implement**

```ts
export type DeletionOutcome =
  | { kind: "scheduled"; anonymisesOn: string }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }

export const DELETION_FAILED = "Could not delete your account. Try again in a moment."

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

export function deletionOutcome(status: number, body: unknown): DeletionOutcome {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  if (status === 200 && typeof fields.anonymisesAt === "string") {
    return { kind: "scheduled", anonymisesOn: formatDay(fields.anonymisesAt) }
  }
  const message = typeof fields.error === "string" && fields.error ? fields.error : DELETION_FAILED
  return status === 409 ? { kind: "refused", message } : { kind: "failed", message }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run lib/account-deletion.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/account-deletion.ts apps/web/lib/account-deletion.test.ts
git commit -m "Turn the deletion response into a UI state"
```

---

### Task 3: Route, and remove the old one

**Files:**
- Create: `apps/web/app/api/user/deletion/route.ts`
- Create: `apps/web/app/api/user/deletion/route.test.ts`
- Delete: `apps/web/app/api/user/account/route.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  request: vi.fn(),
  invalidate: vi.fn(),
  errorResponse: vi.fn(),
  userDelete: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { delete: m.userDelete } } }))
vi.mock("@/lib/api/xvm-api", () => ({ requestAccountDeletion: m.request }))
vi.mock("@/lib/api/xvm-api-store", () => ({
  getValidXvmApiToken: m.token,
  invalidateXvmApiCredential: m.invalidate,
  xvmApiErrorResponse: m.errorResponse,
}))

import { DELETE } from "./route"

const call = () => DELETE(new Request("http://x/api/user/deletion", { method: "DELETE" }) as never)

beforeEach(() => {
  vi.clearAllMocks()
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
  m.request.mockResolvedValue({ requested_at: "2026-10-27T09:00:00Z", anonymises_at: "2026-11-26T09:00:00Z" })
  m.invalidate.mockResolvedValue(undefined)
  m.errorResponse.mockResolvedValue(new Response(JSON.stringify({ error: "Unpaid payroll" }), { status: 409 }))
})

describe("DELETE /api/user/deletion", () => {
  it("is 401 signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.request).not.toHaveBeenCalled()
  })

  it("is 503 without a stored xvm-api token, and does not call xvm-api", async () => {
    m.token.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain("Sign out and back in")
    expect(m.request).not.toHaveBeenCalled()
  })

  it("asks xvm-api, drops the stored credential and returns the day it is anonymised", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ anonymisesAt: "2026-11-26T09:00:00Z" })
    expect(m.request).toHaveBeenCalledWith("tok")
    expect(m.invalidate).toHaveBeenCalledWith("user-1")
  })

  it("passes a refusal through the shared error handler and keeps the credential", async () => {
    const refusal = new Error("409")
    m.request.mockRejectedValue(refusal)
    const res = await call()
    expect(res.status).toBe(409)
    expect(m.errorResponse).toHaveBeenCalledWith(refusal, "user-1", "[account deletion] request error")
    expect(m.invalidate).not.toHaveBeenCalled()
  })

  it("still reports success when clearing the stored credential fails, since xvm-api already revoked it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    m.invalidate.mockRejectedValue(new Error("db down"))
    const res = await call()
    expect(res.status).toBe(200)
  })

  it("never deletes the Prisma user", async () => {
    await call()
    expect(m.userDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run app/api/user/deletion/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requestAccountDeletion, type AccountDeletion } from "@/lib/api/xvm-api"

// DELETE /api/user/deletion - Ask xvm-api to delete the signed-in person's account (30 day grace period)
export const DELETE = withRateLimit(
  async (_request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json(
        { error: "xvm-api link not established yet. Sign out and back in, then try again." },
        { status: 503 }
      )
    }

    let deletion: AccountDeletion
    try {
      deletion = await requestAccountDeletion(token)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[account deletion] request error")
    }

    await invalidateXvmApiCredential(session.user.id).catch((err: unknown) => {
      console.error("[account deletion] could not clear the stored credential:", err)
    })
    return NextResponse.json({ anonymisesAt: deletion.anonymises_at })
  },
  { requests: 5, window: "1 m" }
)
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run app/api/user/deletion/route.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Remove the old route**

Run from the repo root: `git rm apps/web/app/api/user/account/route.ts`
Then confirm nothing else calls it: `git grep -n "api/user/account" -- apps` should print only `settings/page.tsx` (fixed in Task 4).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/user/deletion
git commit -m "Delete accounts through xvm-api, not Prisma

The old route ran prisma.user.delete at once: no grace period, no check
for unpaid payroll or a last owner, and venue roles never ended. The new
route asks xvm-api, which does all three. The Prisma user row stays until
the NextAuth adapter swap."
```

(The `git rm` is already staged and goes into this commit.)

---

### Task 4: Settings page

**Files:**
- Modify: `apps/web/app/dashboard/account/settings/page.tsx`

- [ ] **Step 1: Add the import and state**

Add to the imports (below the `alert-dialog` import):

```tsx
import { DELETION_FAILED, deletionOutcome, type DeletionOutcome } from "@/lib/account-deletion"
```

Add inside `AccountSettingsPage`, after the `notifications` state:

```tsx
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletion, setDeletion] = useState<DeletionOutcome | null>(null)

  const requestDeletion = async () => {
    setDeleting(true)
    try {
      const res = await fetch("/api/user/deletion", { method: "DELETE" })
      const body: unknown = await res.json().catch(() => null)
      const outcome = deletionOutcome(res.status, body)
      setDeletion(outcome)
      if (outcome.kind === "scheduled") setDeleteOpen(false)
    } catch {
      setDeletion({ kind: "failed", message: DELETION_FAILED })
    } finally {
      setDeleting(false)
    }
  }
```

- [ ] **Step 2: Replace the Danger zone card**

Replace the block from `{/* Danger zone */}` to the end of that card (currently lines 231-269) with:

```tsx
      {/* Danger zone */}
      <div className="vcard overflow-hidden mt-6 border-[rgba(243,139,168,0.25)]">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[rgba(243,139,168,0.15)] font-semibold text-sm text-[var(--support-pink)]">
          Danger zone
        </div>
        <div className="pbody">
          {deletion?.kind === "scheduled" ? (
            <>
              <p className="text-[0.88rem] text-muted-foreground mb-4">
                Your account is scheduled for deletion on {deletion.anonymisesOn}. Sign in again before then to cancel it.
                Your venue roles stay ended either way.
              </p>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[var(--blue-018)] text-foreground hover:bg-[var(--blue-007)] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="text-[0.88rem] text-muted-foreground mb-4">
                Deleting your account ends your role at every venue now and signs you out everywhere. Your account is
                anonymised after 30 days. Sign in again before then to cancel the deletion, though your venue roles stay ended.
              </p>
              <AlertDialog
                open={deleteOpen}
                onOpenChange={(open) => {
                  setDeleteOpen(open)
                  if (!open) setDeletion(null)
                }}
              >
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[rgba(243,139,168,0.35)] text-[var(--support-pink)] bg-[rgba(243,139,168,0.06)] hover:bg-[rgba(243,139,168,0.12)] transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Delete account
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your role at every venue ends now and you are signed out everywhere. Your account is anonymised after
                      30 days. Signing in again before then cancels the deletion, but your venue roles stay ended.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deletion && deletion.kind !== "scheduled" && (
                    <p className="text-sm text-[var(--destructive)]">{deletion.message}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleting}
                      className="bg-[var(--support-pink)] text-[#070b14] hover:bg-pink-400"
                      onClick={(event) => {
                        event.preventDefault()
                        void requestDeletion()
                      }}
                    >
                      {deleting ? "Deleting…" : "Delete my account"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` then `npx eslint app/dashboard/account/settings/page.tsx lib/account-deletion.ts app/api/user/deletion/route.ts`
Expected: no output from either.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: all test files pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/account/settings/page.tsx
git commit -m "Show xvm-api's refusal and grace period in the Danger zone

The card said everything would be removed and deleted at once. It now
says what happens (roles end, sign-in is revoked, anonymised after 30
days, a fresh sign-in cancels), shows the API's refusal text inside the
dialog, and holds the scheduled state on the card."
```

---

### Task 5: Live check

Needs xvm-api at the #217 head. Same recipe as the fresh-sign-in check.

- [ ] **Step 1: Stack.** `git -C ~/xvm-api fetch origin pull/217/head:refs/tmp/pr217`, then `git -C ~/xvm-api worktree add --detach ../xvm-api-217-check refs/tmp/pr217`. In that worktree: `uv sync`, `uv run alembic upgrade head`, mint a service credential with `uv run python -m api.scripts.issue_credential --kind service --client dashboard --name "Dashboard local"`, then `uv run python -m api`. Start the local containers with `docker start xiv-app-postgres-local xiv-app-redis-local`. Copy `apps/web/.env.local` from `~/xvm-dashboard` into this worktree, set `XVM_API_BASE_URL=http://127.0.0.1:8000` and `XVM_API_DASHBOARD_SERVICE_TOKEN` to the new secret, then `pnpm install --frozen-lockfile` and `pnpm dev`.
- [ ] **Step 2: Refusal path.** Sign in with Discord, create a venue from the dashboard's New Venue flow (the person becomes its only owner), open Account, Settings, Delete account, confirm. Expected: the dialog stays open and shows xvm-api's last-owner text. Nothing is revoked: `GET /me` with the stored token is still 200.
- [ ] **Step 3: Accepted path.** Remove the blocker (delete the venue, or use a second person), confirm again. Expected: the dialog closes and the card shows the scheduled date, and `sqlite3 apiv2.db "select deletion_requested_at from people"` is set.
- [ ] **Step 4: Cancel path.** Sign out, sign in with Discord. Expected: `deletion_requested_at` is empty again. This also exercises #284.
- [ ] **Step 5: Tear down.** Stop the dev server and API (kill by port, not `pkill -f`), `docker stop` both containers, remove the `~/xvm-api-217-check` worktree.

---

### Task 6: Review and PR

- [ ] **Step 1:** Get one independent review pass over the diff (spec and quality together), per `CLAUDE.md`.
- [ ] **Step 2:** Push `feat/account-deletion-screen` and open a PR with `--base dev`. The body states: it needs xvm-api#217 deployed and xvm-dashboard#284 merged; the Prisma user row is intentionally untouched; the old route is removed.
