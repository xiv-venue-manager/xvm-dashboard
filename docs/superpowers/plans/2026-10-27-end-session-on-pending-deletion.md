# End the Session on a Pending Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When xvm-api refuses the dashboard's refresh exchange with a 409 (account scheduled for deletion, or deleted), every dashboard session ends and the sign-in page says why.

**Architecture:** The `jwt` callback marks the token (`deletionPending`) on a 409 from the refresh exchange and stops retrying. The session exposes the flag. `SessionProvider` signs the browser out when it sees it, `proxy.ts` redirects a marked token to sign-in, and the sign-in page shows a notice chosen by a `reason` query parameter. The tab that deletes the account signs out at once instead of showing the scheduled-date card.

**Tech Stack:** Next.js 16, next-auth 4.24.15 (JWT sessions), vitest in the node environment (no jsdom), TypeScript strict.

Spec: `docs/superpowers/specs/2026-10-27-end-session-on-pending-deletion-design.md`.

## Where this runs

Tasks 1 to 5 run in `~/xvm-dashboard-session-end`, branch `feat/end-session-on-pending-deletion`, which is based on #284's head (`origin/feat/fresh-sign-in`) because the refresh branch it edits is #284's. Tasks 6 and 7 move the work onto #286's branch (`feat/account-deletion-screen`, worktree `~/xvm-dashboard-delete-account`) once #284 has merged. All commands run from `apps/web` unless a step says otherwise. Commit messages end with the two trailer lines below, in one block (use `git commit -F -`):

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
```

No inline comments that explain what code does. A comment only for a non-obvious reason.

## File structure

- Modify `types/next-auth.d.ts`: `JWT.deletionPending?`, `Session.deletionPending?`.
- Modify `lib/auth.ts`: mark on 409, skip the exchange while marked, expose the flag in the session callback.
- Modify `lib/auth.test.ts`: mock `XvmApiError`, add the cases.
- Create `lib/sign-in-reason.ts` and `lib/sign-in-reason.test.ts`: the reason code, the sign-in URL, the notice text.
- Modify `proxy.ts` and `proxy.test.ts`: redirect a marked token.
- Modify `components/session-provider.tsx`: the watcher.
- Modify `app/auth/signin/page.tsx`: the notice.
- Modify (on #286) `lib/account-deletion.ts`, `lib/account-deletion.test.ts`, `app/dashboard/account/settings/page.tsx`.

---

### Task 1: Mark the token on a 409 from the refresh exchange

**Files:**
- Modify: `types/next-auth.d.ts`
- Modify: `lib/auth.ts` (the `jwt` refresh branch and the `session` callback)
- Test: `lib/auth.test.ts`

- [ ] **Step 1: Teach the test's xvm-api mock about `XvmApiError`**

In `lib/auth.test.ts` replace the line `vi.mock("@/lib/api/xvm-api", () => ({ exchangeToken: vi.fn() }))` with:

```ts
vi.mock("@/lib/api/xvm-api", () => ({
  exchangeToken: vi.fn(),
  XvmApiError: class XvmApiError extends Error {
    constructor(
      public status: number,
      public body: string
    ) {
      super(`xvm-api ${status}: ${body}`)
    }
  },
}))
```

and replace `import { exchangeToken } from "@/lib/api/xvm-api"` with `import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"`.

- [ ] **Step 2: Write the failing tests**

Inside `describe("jwt", ...)`, after the existing last `it(...)`, add:

```ts
  describe("a pending deletion", () => {
    const refreshing = () => {
      vi.mocked(getValidXvmApiToken).mockResolvedValue(null)
      m.accountFindFirst.mockResolvedValue({ providerAccountId: "4242" })
    }

    it("marks the token when the refresh exchange is refused with a 409", async () => {
      refreshing()
      vi.mocked(exchangeToken).mockRejectedValueOnce(
        new XvmApiError(409, '{"detail":"This account is scheduled for deletion. Sign in again to cancel it."}')
      )
      const token = await jwt({ token: { id: "u1", name: "A" } })
      expect(token.deletionPending).toBe(true)
      expect(console.error).not.toHaveBeenCalled()
    })

    it("does not mark the token for any other failure, which stays logged and non-fatal", async () => {
      refreshing()
      vi.mocked(exchangeToken)
        .mockRejectedValueOnce(new XvmApiError(503, "down"))
        .mockRejectedValueOnce(new Error("network"))
      expect((await jwt({ token: { id: "u1", name: "A" } })).deletionPending).toBeUndefined()
      expect((await jwt({ token: { id: "u1", name: "A" } })).deletionPending).toBeUndefined()
      expect(console.error).toHaveBeenCalledTimes(2)
    })

    it("does not try to mint a token again while the marker is set", async () => {
      refreshing()
      const token = await jwt({ token: { id: "u1", name: "A", deletionPending: true } })
      expect(token.deletionPending).toBe(true)
      expect(getValidXvmApiToken).not.toHaveBeenCalled()
      expect(exchangeToken).not.toHaveBeenCalled()
    })
  })
```

After the `describe("jwt", ...)` block add:

```ts
describe("session", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (args: any) => (authOptions.callbacks!.session as any)(args)

  it("exposes the pending deletion marker", async () => {
    const out = await session({ session: { user: {} }, token: { id: "u1", deletionPending: true } })
    expect(out.deletionPending).toBe(true)
    expect(out.user.id).toBe("u1")
  })

  it("leaves the flag off a normal session", async () => {
    const out = await session({ session: { user: {} }, token: { id: "u1" } })
    expect(out.deletionPending).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL. The marker tests fail because nothing sets `deletionPending` (and `token.deletionPending` is not on the `JWT` type, which vitest does not check).

- [ ] **Step 4: Add the fields to the types**

In `types/next-auth.d.ts`, in `interface Session` add a first line `deletionPending?: boolean` before `user: {`, and in `interface JWT` add `deletionPending?: boolean` after `id: string`. The two blocks become:

```ts
  interface Session {
    deletionPending?: boolean
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
```

```ts
  interface JWT {
    id: string
    deletionPending?: boolean
    discord?: { accessToken: string; expiresAt: number | null; scope: string | null }
  }
```

- [ ] **Step 5: Mark on a 409 and skip while marked**

In `lib/auth.ts` change the import `import { exchangeToken } from "@/lib/api/xvm-api"` to `import { exchangeToken, XvmApiError } from "@/lib/api/xvm-api"`.

Replace the refresh branch (the `if (token.id && !isFirstDiscordSignIn) { ... }` block, including its leading comment) with:

```ts
      // Refresh the xvm-api token on every callback invocation if it's missing
      // or near expiry. Same non-fatal handling as above, except a 409: xvm-api
      // has revoked every credential for an account that is scheduled for
      // deletion (or deleted), so this session cannot continue.
      if (token.id && !isFirstDiscordSignIn && !token.deletionPending) {
        try {
          const existing = await getValidXvmApiToken(token.id as string)
          if (!existing) {
            const discordAccount = await prisma.account.findFirst({
              where: { userId: token.id as string, provider: "discord" },
            })
            if (discordAccount) {
              const issued = await exchangeToken(discordAccount.providerAccountId, (token.name as string) ?? "Unknown")
              await upsertXvmApiCredential(token.id as string, issued)
            }
          }
        } catch (err) {
          if (err instanceof XvmApiError && err.status === 409) {
            token.deletionPending = true
          } else {
            console.error("xvm-api token refresh failed:", err)
          }
        }
      }
```

Replace the `session` callback body so it reads:

```ts
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      if (token.deletionPending) {
        session.deletionPending = true
      }
      return session
    },
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS (the new tests and every existing one).

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint lib/auth.ts lib/auth.test.ts types/next-auth.d.ts`
Expected: no output from either (ignore `npm notice` lines).

- [ ] **Step 8: Commit**

```bash
git add apps/web/types/next-auth.d.ts apps/web/lib/auth.ts apps/web/lib/auth.test.ts
git commit -F - <<'EOF'
Mark the token when xvm-api refuses the refresh exchange with a 409

After a deletion is accepted xvm-api revokes every credential and refuses
the dashboard's refresh exchange with a 409 until the person signs in
again. The refresh branch logged it and carried on, so each page load
fired more exchanges that all 409 and the session stayed signed in with
no xvm-api token. It now marks the token deletionPending, stops retrying
while it is set, and the session exposes the flag. Any other failure is
still logged and non-fatal.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
EOF
```

---

### Task 2: The sign-in reason helper

**Files:**
- Create: `lib/sign-in-reason.ts`
- Test: `lib/sign-in-reason.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/sign-in-reason.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { DELETION_SIGN_IN_URL, signInNotice } from "./sign-in-reason"

describe("signInNotice", () => {
  it("explains a session ended by a pending deletion", () => {
    expect(signInNotice("deletion")).toMatch(/scheduled for deletion or was deleted/)
    expect(signInNotice("deletion")).toMatch(/cancels a pending deletion/)
  })

  it("says nothing for an unknown reason, including names on Object.prototype", () => {
    expect(signInNotice("unknown")).toBeNull()
    expect(signInNotice("constructor")).toBeNull()
  })

  it("says nothing without a reason", () => {
    expect(signInNotice(null)).toBeNull()
    expect(signInNotice("")).toBeNull()
  })
})

describe("DELETION_SIGN_IN_URL", () => {
  it("is the sign-in page with the reason the notice understands", () => {
    const url = new URL(DELETION_SIGN_IN_URL, "http://localhost")
    expect(url.pathname).toBe("/auth/signin")
    expect(signInNotice(url.searchParams.get("reason"))).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/sign-in-reason.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

Create `lib/sign-in-reason.ts`:

```ts
export const DELETION_REASON = "deletion"
export const DELETION_SIGN_IN_URL = `/auth/signin?reason=${DELETION_REASON}`

const DELETION_NOTICE =
  "Your session ended because this account is scheduled for deletion or was deleted. Signing in again cancels a pending deletion."

export function signInNotice(reason: string | null): string | null {
  return reason === DELETION_REASON ? DELETION_NOTICE : null
}
```

- [ ] **Step 4: Run it to see it pass, then typecheck and lint**

Run: `npx vitest run lib/sign-in-reason.test.ts`, `npx tsc --noEmit`, `npx eslint lib/sign-in-reason.ts lib/sign-in-reason.test.ts`
Expected: tests pass, no output from tsc or eslint.

- [ ] **Step 5: Check the shared assets list**

Read `docs/SHARED_ASSETS.md`. If it lists helpers of this kind (small `lib/` helpers), add one line for `lib/sign-in-reason.ts` in the same style. If it only lists components or does not list helpers like `lib/callback-url.ts`, leave it alone.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/sign-in-reason.ts apps/web/lib/sign-in-reason.test.ts docs/SHARED_ASSETS.md
git commit -F - <<'EOF'
Add the reason code and notice for a session ended by a deletion

A pure helper so the proxy, the browser sign-out and the sign-in page
agree on one reason code, and the notice text is tested without jsdom.
An unknown reason, or none, shows nothing.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
EOF
```

(If `docs/SHARED_ASSETS.md` was not changed, `git add` of it is a no-op and the commit still succeeds.)

---

### Task 3: Redirect a marked token in the proxy

**Files:**
- Modify: `proxy.ts`
- Test: `proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

In `proxy.test.ts`, inside `describe("proxy", ...)` after the last `it(...)`, add:

```ts
  it("sends a request whose token is marked as pending deletion to sign-in, saying why", async () => {
    m.getToken.mockResolvedValue({ id: "user-1", deletionPending: true })

    const res = await proxy(new NextRequest(deepLink))

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.pathname).toBe("/auth/signin")
    expect(location.searchParams.get("reason")).toBe("deletion")
    expect(location.searchParams.get("callbackUrl")).toBe("/admin/feedback?report=7")
  })

  it("gives a signed-out request no reason", async () => {
    m.getToken.mockResolvedValue(null)

    const res = await proxy(new NextRequest(deepLink))

    expect(new URL(res.headers.get("location")!).searchParams.has("reason")).toBe(false)
  })
```

- [ ] **Step 2: Run them to see the first fail**

Run: `npx vitest run proxy.test.ts`
Expected: the marked-token test FAILS (it gets through with no redirect). The signed-out test passes.

- [ ] **Step 3: Implement**

In `proxy.ts` add `import { DELETION_REASON } from "@/lib/sign-in-reason"` under the existing `session-cookie` import, and replace the block:

```ts
    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url)
      signInUrl.searchParams.set("callbackUrl", path + req.nextUrl.search)
      return NextResponse.redirect(signInUrl)
    }
```

with:

```ts
    if (!token || token.deletionPending) {
      const signInUrl = new URL("/auth/signin", req.url)
      signInUrl.searchParams.set("callbackUrl", path + req.nextUrl.search)
      if (token) signInUrl.searchParams.set("reason", DELETION_REASON)
      return NextResponse.redirect(signInUrl)
    }
```

- [ ] **Step 4: Run, typecheck, lint**

Run: `npx vitest run proxy.test.ts`, `npx tsc --noEmit`, `npx eslint proxy.ts proxy.test.ts`
Expected: tests pass, no output from tsc or eslint.

- [ ] **Step 5: Commit**

```bash
git add apps/web/proxy.ts apps/web/proxy.test.ts
git commit -F - <<'EOF'
Treat a token marked as pending deletion like a missing one in the proxy

Server-rendered pages cannot rewrite the session cookie, so the marker
only reaches it after the browser's first session fetch. From then on a
request carrying it is sent to sign-in with the reason, instead of
rendering a page that has no xvm-api token.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
EOF
```

---

### Task 4: Sign the browser out and explain on the sign-in page

**Files:**
- Modify: `components/session-provider.tsx`
- Modify: `app/auth/signin/page.tsx`

There is no jsdom, so these are verified by `tsc`, eslint and Task 5's live check.

- [ ] **Step 1: The watcher**

Replace `components/session-provider.tsx` with:

```tsx
"use client"

import { useEffect, useRef } from "react"
import { SessionProvider as NextAuthSessionProvider, signOut, useSession } from "next-auth/react"
import { DELETION_SIGN_IN_URL } from "@/lib/sign-in-reason"

function EndSessionOnPendingDeletion() {
  const { data: session } = useSession()
  const ended = useRef(false)

  useEffect(() => {
    if (!session?.deletionPending || ended.current) return
    ended.current = true
    void signOut({ callbackUrl: DELETION_SIGN_IN_URL })
  }, [session?.deletionPending])

  return null
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <EndSessionOnPendingDeletion />
      {children}
    </NextAuthSessionProvider>
  )
}
```

- [ ] **Step 2: The notice**

In `app/auth/signin/page.tsx`:

Add these imports below the existing ones:

```tsx
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signInNotice } from "@/lib/sign-in-reason"
```

Add this component above `export default function SignInPage()`:

```tsx
function SignInNotice() {
  const notice = signInNotice(useSearchParams().get("reason"))
  if (!notice) return null
  return (
    <Alert>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  )
}
```

(`useSearchParams` needs a Suspense boundary in a statically rendered page, which is why the page wraps it.) Inside the card, between the closing `</div>` of the "Welcome Back" block and the `<Button`, add:

```tsx
          <Suspense fallback={null}>
            <SignInNotice />
          </Suspense>
```

- [ ] **Step 3: Typecheck, lint, full test run**

Run: `npx tsc --noEmit`, `npx eslint components/session-provider.tsx app/auth/signin/page.tsx`, `npx vitest run`
Expected: no output from tsc or eslint; the full suite passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/session-provider.tsx apps/web/app/auth/signin/page.tsx
git commit -F - <<'EOF'
Sign the browser out on a pending deletion and say why on sign-in

SessionProvider signs out, once, when the session carries the
deletionPending flag. This client fetch is what writes the marker into
the cookie, since a server-rendered page cannot. The sign-in page shows
the notice for ?reason=deletion inside a Suspense boundary, as
useSearchParams requires on a statically rendered page.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
EOF
```

---

### Task 5: Live check of another session ending

Needs the person's Discord sign-in in Chrome, so it waits until they are at their PC. The deleting tab is checked in Task 7.

- [ ] **Step 1: Start the stack** (same recipe as the earlier live checks)

1. `docker start xiv-app-postgres-local xiv-app-redis-local`.
2. Take the Discord id: `docker exec xiv-app-postgres-local psql -U postgres -d venue_manager -tAc "select \"discordId\" from users where \"discordId\" is not null order by \"createdAt\" limit 1"`.
3. `git -C ~/xvm-api-graph fetch origin -q && git -C ~/xvm-api-graph worktree add --detach ~/xvm-api-livecheck origin/dev`. In it: `uv sync`, `uv run alembic upgrade head`, `uv run python -m api.scripts.seed --yes --owner-discord-id <id>` (it prints the `service dashboard` secret), then run `uv run python -m api` in the background with its output redirected to `$SP/api-live.log` (`SP` is the session scratchpad directory).
4. In this worktree's `apps/web`: copy `~/xvm-dashboard/apps/web/.env.local` to `.env.local`, set `XVM_API_BASE_URL=http://127.0.0.1:8000` and `XVM_API_DASHBOARD_SERVICE_TOKEN` to the printed secret, run `docker exec xiv-app-postgres-local psql -U postgres -d venue_manager -c "delete from xvm_api_credentials;"` and `docker exec xiv-app-redis-local redis-cli FLUSHDB`, then `pnpm dev`.
5. Never use `path` as a zsh variable name, and kill servers by port, not `pkill -f`.

- [ ] **Step 2: Signed in, a normal page loads**

In Chrome (existing session, or sign in with Discord), open `http://localhost:3000/dashboard/account`. Expected: the profile page renders. Open `http://localhost:3000/auth/signin?reason=deletion` in a private window: the notice shows above the button. Open `http://localhost:3000/auth/signin?reason=nonsense`: no notice.

- [ ] **Step 3: Put the account into a pending deletion behind the dashboard's back**

```bash
sqlite3 ~/xvm-api-livecheck/apiv2.db "update people set deletion_requested_at = datetime('now') where id = 1; update credentials set revoked_at = datetime('now') where person_id = 1 and client = 'dashboard' and revoked_at is null;"
docker exec xiv-app-postgres-local psql -U postgres -d venue_manager -c "delete from xvm_api_credentials;"
```

Count the existing 409s: `grep -c "tokens/exchange.*409" $SP/api-live.log`.

- [ ] **Step 4: Reload in Chrome**

Reload `http://localhost:3000/dashboard/account`. Expected: the browser ends up on `/auth/signin?reason=deletion` with the notice, and the session cookie is gone. Count the 409s again: the increase should be a handful for this reload, not a stream, and a further reload on the sign-in page adds none.

- [ ] **Step 5: Sign in again cancels it**

Sign in with Discord. Expected: `sqlite3 ~/xvm-api-livecheck/apiv2.db "select deletion_requested_at from people where id = 1"` prints an empty value, and the dashboard loads.

- [ ] **Step 6: Tear down**

Kill the two servers by port (`ss -ltnp | grep :3000`, `:8000`), `docker stop xiv-app-postgres-local xiv-app-redis-local`, `rm apps/web/.env.local`, `git -C ~/xvm-api-graph worktree remove --force ~/xvm-api-livecheck`.

---

### Task 6: Move the work onto #286

Do this only once #284 has merged. #286's commits do not touch `auth.ts`, so the rebase is clean.

- [ ] **Step 1: Check #284 merged**

Run: `gh pr view 284 -R xiv-venue-manager/xvm-dashboard --json state --jq .state`
Expected: `MERGED`. If not, stop and wait.

- [ ] **Step 2: Rebase #286 onto dev**

```bash
cd ~/xvm-dashboard-delete-account
git fetch origin
git rebase origin/dev
```

Expected: no conflicts. If there are, stop and report them.

- [ ] **Step 3: Bring over Tasks 1 to 4**

```bash
git cherry-pick origin/feat/fresh-sign-in..feat/end-session-on-pending-deletion
```

This picks the spec, plan and the four task commits. Expected: no conflicts, since #284's changes are now in `dev`. Run `npx tsc --noEmit` and `npx vitest run lib/auth.test.ts proxy.test.ts lib/sign-in-reason.test.ts` from `apps/web` and expect a pass.

---

### Task 7: The deleting tab signs out at once (on #286)

**Files:**
- Modify: `lib/account-deletion.ts`, `lib/account-deletion.test.ts`
- Modify: `app/dashboard/account/settings/page.tsx`

- [ ] **Step 1: Update the helper's test**

In `lib/account-deletion.test.ts` replace the first test with:

```ts
  it("is scheduled on a 200 that carries a date", () => {
    expect(deletionOutcome(200, { anonymisesAt: "2026-11-26T09:00:00Z" })).toEqual({ kind: "scheduled" })
  })
```

The other tests stay as they are.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/account-deletion.test.ts`
Expected: FAIL, the outcome still carries `anonymisesOn`.

- [ ] **Step 3: Update the helper**

In `lib/account-deletion.ts` change the type to `| { kind: "scheduled" }`, delete the `formatDay` function, and replace the success branch with:

```ts
  if (status === 200 && typeof fields.anonymisesAt === "string" && !Number.isNaN(new Date(fields.anonymisesAt).getTime())) {
    return { kind: "scheduled" }
  }
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run lib/account-deletion.test.ts`
Expected: PASS, all seven.

- [ ] **Step 5: Update the settings page**

In `app/dashboard/account/settings/page.tsx`:

1. In the lucide import remove `LogOut`: `import { ArrowLeft, Save, Trash2, Bell, Key } from "lucide-react"`.
2. Add `import { DELETION_SIGN_IN_URL } from "@/lib/sign-in-reason"` after the `account-deletion` import.
3. Change the state line to `const [deletion, setDeletion] = useState<Exclude<DeletionOutcome, { kind: "scheduled" }> | null>(null)`.
4. Replace `requestDeletion` with:

```ts
  const requestDeletion = async () => {
    setDeleting(true)
    let outcome: DeletionOutcome
    try {
      const res = await fetch("/api/user/deletion", { method: "DELETE" })
      const body: unknown = await res.json().catch(() => null)
      outcome = deletionOutcome(res.status, body)
    } catch {
      outcome = { kind: "failed", message: DELETION_FAILED }
    }
    if (outcome.kind === "scheduled") {
      await signOut({ callbackUrl: DELETION_SIGN_IN_URL })
      return
    }
    setDeletion(outcome)
    setDeleting(false)
  }
```

5. In the Danger zone card replace the whole `{deletion?.kind === "scheduled" ? ( ... ) : ( ... )}` expression with the content of its second branch only, without the fragment: the `<p>` of copy and the `<AlertDialog>` element, directly inside `<div className="pbody">`, dedented one level. Delete the first branch (the scheduled paragraph and its Sign out button) entirely.

- [ ] **Step 6: Typecheck, lint, full run**

Run: `npx tsc --noEmit`, `npx eslint app/dashboard/account/settings/page.tsx lib/account-deletion.ts lib/account-deletion.test.ts`, `npx vitest run`
Expected: no output from tsc or eslint; the full suite passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/account-deletion.ts apps/web/lib/account-deletion.test.ts apps/web/app/dashboard/account/settings/page.tsx
git commit -F - <<'EOF'
Sign the deleting tab out at once instead of showing a scheduled card

Every other session now ends when xvm-api revokes the credentials, so
this tab did too, a moment later and without explanation. It now signs
out as soon as the deletion is accepted and lands on the sign-in page
with the notice, which also matches the dialog's "signed out
everywhere". The scheduled-date card goes: the date was only known in
this tab, and the notice has to work for every session.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
EOF
```

- [ ] **Step 8: Live check of the deleting tab**

Same stack as Task 5. In Chrome signed in, make the person the sole owner of nothing blocking (the seeded person owns seeded venues, so first remove the blockers: `sqlite3 ~/xvm-api-livecheck/apiv2.db "update venues set is_active = 0"`), open Account Settings, press Delete account, confirm. Expected: the tab ends up on `/auth/signin?reason=deletion` with the notice, `deletion_requested_at` is set, and signing in with Discord clears it. Then tear down as in Task 5 Step 6.

---

### Task 8: Review, push, report

- [ ] **Step 1: Whole-branch review**

Dispatch one reviewer over the full diff of #286 against `origin/dev` (spec compliance, correctness of the session ending, nothing that logs or leaks the reason, and the interaction with `signOut`), then fix findings with new commits, not amends.

- [ ] **Step 2: Push**

```bash
git push --force-with-lease origin feat/account-deletion-screen
```

(The rebase rewrote history, which is why the lease is needed.)

- [ ] **Step 3: Tell the person, before posting anything**

Summarise the change and ask whether to update the #286 description (the new behaviour, the dropped scheduled card) and reply to Allegro's review. Do not post to GitHub without that go-ahead.
