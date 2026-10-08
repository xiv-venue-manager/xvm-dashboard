# Remove the NextAuth Prisma adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign-in, sessions and the Discord grant work with no Prisma at all, so the `User`, `Account`, `Session` and `VerificationToken` models can be deleted with the rest of Prisma.

**Architecture:** The app already uses `session: { strategy: "jwt" }`, so the adapter only does two jobs: create and look up a Prisma `User` row at sign-in, and store the Discord OAuth grant in `accounts`. Both move into the encrypted JWT, and the person is xvm-api's `Person`. Task 1 ships now. Tasks 3 to 5 are the flip and cannot ship until the preconditions below are true.

**Tech Stack:** next-auth v4 (JWT strategy), `next-auth/jwt` `getToken`, vitest, xvm-api `/me`.

---

## Why this is the last link, not the first

Removing the adapter stops new sign-ins from creating a Prisma `users` row. Ten Prisma models have a foreign key to `User`, including `ApiKey`, `XvmApiCredential`, `Notification`, `PendingNotification`, `UserCharacter` and `Feedback`. Flipped early, a new person signs in and every one of those writes fails.

The order is therefore:

1. Plugin cutover (API keys, plugin shift claim, plugin characters and inventory). Owner decision 2026-10-08: the plugin switches in the window and everyone relinks.
2. Shift pipeline and notifications off Prisma (waiting on Allegro).
3. Credential cache into the JWT (see the "credential cache" section added to `docs/PRISMA_MIGRATION_MANIFEST.md` in PR #150). It cannot move earlier because about ten plugin routes and `lib/api/transactions.ts` need a person token with no browser session; step 1 removes them.
4. **This plan, Tasks 3 to 5.**
5. Delete the Prisma schema.

Task 1 is independent of that chain. It removes the only code that reads the `accounts` table for anything but sign-in, and it fixes a second problem (below).

**Precondition check for Tasks 3 to 5.** Run from the repo root on current `dev`. It must print nothing:

```bash
grep -rnE "prisma\.(apiKey|xvmApiCredential|notification|pendingNotification|userCharacter|feedback|shoutTemplate|announcementDismissal|venueFollow)\b" apps/web/app apps/web/lib | grep -v "\.test\."
```

## What the adapter does today (verified 2026-10-08 on `dev` and read-only on prod)

| Fact | Detail |
|---|---|
| Who creates the user | `PrismaAdapter` creates a `users` row with a cuid at first sign-in. `session.user.id` is that cuid. |
| Who uses the id | 127 files read `session.user.id`. 144 call sites pass it to `getValidXvmApiToken`, 135 to `xvmApiErrorResponse`, and 71 pass it as `userId:` (mostly into `requireVenueRole`). It is an opaque key into the credential cache and the gates helper. |
| The Discord grant | `accounts` holds `access_token`, `expires_at`, `scope`. Only `lib/discord-user.ts` reads them (two callers: `discord/guilds` GET and `discord/link` POST). `lib/auth.ts` rewrites them on every sign-in because next-auth only writes them once. |
| The JWT already carries a copy | `jwt` sets `token.accessToken = account.access_token`. Nothing reads it. |
| Non-auth readers of `users`/`accounts` | `api/user/profile` (display name, notification settings), `api/user/account` (delete), `dashboard/account/page.tsx`, `venues/[slug]/page.tsx` (owner name, image, join date), `lib/api/resolve-entry-names.ts`, `api/plugin/shifts/claim`, `lib/shift-bot.ts`, `api/bot/shifts/clock-in` and `clock-out`, `lib/discord-feed.ts` (raw SQL). The last four are the shift pipeline and the old bots. |
| Prod `users` (254) | `isAdmin` true for 1; `settings` set for 11 (only a `notifications` key); `displayName` set for 41, and 33 of those differ from the Discord name; `email` set for 252. |
| What xvm-api offers | `GET /me`, `PATCH /me` (display name only), `GET /me/venues`, `GET /me/credentials`, `POST /me/credentials/{id}/revoke`, `POST /internal/tokens/exchange` (discord only). **No person delete, no notification preferences, no avatar or email field.** `Person.is_platform_admin` exists. |

## Target design

- No `adapter`. The JWT strategy and cookie settings stay as they are.
- `token.id` is the Discord id (`account.providerAccountId`). With no adapter next-auth uses the provider profile as the user, so `user.id` is already that value. It is stable, needs no xvm-api call, and replaces the cuid wherever the app uses the id as an opaque key.
- `token.personId` is the xvm-api person id, read from `/me` after the token exchange.
- The Discord grant (`accessToken`, `expiresAt`, `scope`) and, after the credential-cache plan, the xvm-api bearer live in the encrypted JWT and are never copied into the `session` callback's output.
- A failed token exchange fails the sign-in. xvm-api is the only path, so a session without a bearer is useless.
- Sessions issued before the flip carry a cuid in `token.id` and must not be honoured. The cookie name changes once (Task 4).

## Task 1: Read the Discord grant from the JWT (ships now)

Fixes the original reason for the `accounts` rewrite: with the JWT as the only store, the grant is replaced at every sign-in with no extra write, so a renewed Discord grant can never be discarded.

**Files:**
- Modify: `apps/web/types/next-auth.d.ts`
- Modify: `apps/web/lib/auth.ts` (jwt callback; delete the `prisma.account.update` block in `signIn`)
- Modify: `apps/web/lib/discord-user.ts`
- Modify: `apps/web/app/api/venues/[venueId]/discord/guilds/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/discord/link/route.ts`
- Modify: `apps/web/lib/auth.test.ts`, the two route tests above
- Create: `apps/web/lib/discord-user.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `apps/web/lib/discord-user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { listManageableGuilds, administersGuild, type DiscordGrant } from "./discord-user"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

const live: DiscordGrant = {
  accessToken: "tok",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  scope: "identify email guilds",
}

const guild = (over: Record<string, unknown>) => ({
  id: "1",
  name: "A",
  icon: null,
  owner: false,
  permissions: "0",
  ...over,
})

beforeEach(() => {
  fetchMock.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("listManageableGuilds", () => {
  it("asks to sign in again when there is no grant", async () => {
    expect(await listManageableGuilds(null)).toEqual({ ok: false, failure: "reauth_required" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks to sign in again when the grant predates the guilds scope", async () => {
    const result = await listManageableGuilds({ ...live, scope: "identify email" })
    expect(result).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("asks to sign in again when the grant has expired", async () => {
    const result = await listManageableGuilds({ ...live, expiresAt: 1 })
    expect(result).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("sends the grant's own token and keeps only guilds the caller owns or manages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        guild({ id: "1", name: "Owned", owner: true }),
        guild({ id: "2", name: "Managed", permissions: "32" }),
        guild({ id: "3", name: "Member only", permissions: "0" }),
      ],
    })
    const result = await listManageableGuilds(live)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok")
    expect(result).toEqual({
      ok: true,
      guilds: [
        { id: "2", name: "Managed", iconUrl: null },
        { id: "1", name: "Owned", iconUrl: null },
      ],
    })
  })

  it("treats a 401 from Discord as a sign-in prompt, not an outage", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    expect(await listManageableGuilds(live)).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("reports Discord being down as unavailable", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    expect(await listManageableGuilds(live)).toEqual({ ok: false, failure: "discord_unavailable" })
  })
})

describe("administersGuild", () => {
  it("is true only for a guild in the caller's manageable list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [guild({ id: "2", name: "Managed", permissions: "32" })],
    })
    expect(await administersGuild(live, "2")).toEqual({ ok: true, administers: true })
    expect(await administersGuild(live, "9")).toEqual({ ok: true, administers: false })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && pnpm exec vitest run lib/discord-user.test.ts`
Expected: FAIL. `DiscordGrant` is not exported and `listManageableGuilds` still takes a user id and reads Prisma.

- [ ] **Step 3: Rewrite the helper**

In `apps/web/lib/discord-user.ts`, remove the `prisma` import and replace the two exported functions. Keep `iconUrl`, the types and the guild filtering exactly as they are.

```ts
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"

export interface DiscordGrant {
  accessToken: string
  expiresAt: number | null
  scope: string | null
}

export async function discordGrantFrom(request: NextRequest): Promise<DiscordGrant | null> {
  const token = await getToken({ req: request })
  return token?.discord ?? null
}

export async function listManageableGuilds(grant: DiscordGrant | null): Promise<ManageableGuilds> {
  const hasScope = grant?.scope?.split(" ").includes("guilds") ?? false
  const live = grant?.expiresAt != null && grant.expiresAt * 1000 > Date.now()
  if (!grant?.accessToken || !hasScope || !live) return { ok: false, failure: "reauth_required" }

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${grant.accessToken}` },
  }).catch(() => null)
  // ... the rest of the function is unchanged
}

export async function administersGuild(grant: DiscordGrant | null, guildId: string): Promise<GuildAuthority> {
  const result = await listManageableGuilds(grant)
  if (!result.ok) return result
  return { ok: true, administers: result.guilds.some((guild) => guild.id === guildId) }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/web && pnpm exec vitest run lib/discord-user.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Put the grant on the token**

In `apps/web/types/next-auth.d.ts`, replace the `JWT` interface with:

```ts
declare module "next-auth/jwt" {
  interface JWT {
    id: string
    discord?: { accessToken: string; expiresAt: number | null; scope: string | null }
  }
}
```

In `apps/web/lib/auth.ts`, in the `jwt` callback replace `token.accessToken = account.access_token` with:

```ts
if (account.provider === "discord" && account.access_token) {
  token.discord = {
    accessToken: account.access_token,
    expiresAt: account.expires_at ?? null,
    scope: account.scope ?? null,
  }
}
```

Then delete the whole `try { await prisma.account.update(...) } catch` block and its comment from `signIn`, keeping the avatar `prisma.user.update` above it.

- [ ] **Step 6: Update the two callers and their tests**

`discord/guilds/route.ts`: rename `_request` to `request`, import `discordGrantFrom`, and change the call to:

```ts
const manageable = await listManageableGuilds(await discordGrantFrom(request))
```

`discord/link/route.ts`: change the call to:

```ts
const authority = await administersGuild(await discordGrantFrom(request), guildId)
```

In both route tests, add a `grant` mock and expose it from the `@/lib/discord-user` mock:

```ts
vi.mock("@/lib/discord-user", () => ({ listManageableGuilds: m.manageable, discordGrantFrom: m.grant }))
```
(for `link`, `administersGuild: m.administers` instead), define `grant: vi.fn()` in the hoisted `m`, set `m.grant.mockResolvedValue({ accessToken: "t", expiresAt: 9999999999, scope: "identify guilds" })` in `beforeEach`, and add one assertion per file that the helper received that grant.

- [ ] **Step 7: Replace the sign-in refresh tests**

In `apps/web/lib/auth.test.ts`: remove `account: { updateMany/update }` from the Prisma mock and delete the three tests that assert the `accounts` write (they assert behaviour that no longer exists). Add:

```ts
describe("jwt", () => {
  it("puts the renewed Discord grant on the token at every sign-in", async () => {
    const token = await (authOptions.callbacks!.jwt as any)({
      token: { id: "u1" },
      user: { id: "u1", name: "A" },
      account,
    })
    expect(token.discord).toEqual({
      accessToken: "fresh-token",
      expiresAt: 1800000000,
      scope: "identify email guilds",
    })
  })
})
```

- [ ] **Step 8: Verify and commit**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run lib app/api/venues && pnpm run lint`
Expected: no type errors, all tests pass, lint 0 errors.

```bash
git add -A apps/web
git commit -m "Read the Discord grant from the session token instead of the accounts table"
```

**Rollout note.** A session issued before this ships has no `discord` grant, so the first guild picker use asks that person to sign in again. That is the same prompt the picker already shows for a stale grant.

## Task 2: Move the non-auth readers off `users` and `accounts`

Not yet plannable as code. Each needs an answer from Allegro or a decision, listed in "Asks". Once answered, each becomes its own task with tests.

| Reader | Replace with | Needs |
|---|---|---|
| `dashboard/account/page.tsx` | session name and image, `GET /me/venues` for the venue list | nothing; can be written now |
| `api/user/profile` PATCH `displayName` | `PATCH /me` | nothing; can be written now (xvm-api max is 100, ours is 50) |
| `api/user/profile` GET and `notifications` settings | no home | Ask 2 |
| `api/user/account` DELETE | no person delete | Ask 3 |
| `venues/[slug]/page.tsx` (owner name, image, join date) | a public owner field | Ask 4 |
| `lib/api/resolve-entry-names.ts` | display name on the entry row | Ask 1 |
| `api/plugin/shifts/claim`, `lib/shift-bot.ts` | gone with the plugin and shift-pipeline cutovers | those cutovers |
| `api/bot/shifts/*`, `lib/discord-feed.ts` | removed with the old bots | xvm-bot |

## Task 3: Flip `lib/auth.ts` to no adapter

**Precondition: the check at the top prints nothing, and the credential-cache plan has landed (the bearer is in the JWT).**

**Files:** modify `apps/web/lib/auth.ts`, `apps/web/types/next-auth.d.ts`, `apps/web/lib/auth.test.ts`.

- [ ] **Step 1: Write the failing tests** in `auth.test.ts`:
  - `authOptions.adapter` is `undefined`.
  - `jwt` with a Discord `account` sets `token.id` to `account.providerAccountId`, not `user.id`.
  - `jwt` rejects (throws) when `exchangeToken` rejects, so a sign-in without a bearer fails.
  - `jwt` sets `token.personId` from the mocked `getMe`.
  - `session` callback output never contains `discord` or the bearer.
  - `signIn` returns `false` when there is no `providerAccountId`.

- [ ] **Step 2: Run them and watch them fail.** `cd apps/web && pnpm exec vitest run lib/auth.test.ts`

- [ ] **Step 3: Edit `auth.ts`.**
  - Delete the `PrismaAdapter` import, `prisma` import and the `adapter:` line.
  - `signIn` becomes `return Boolean(account?.providerAccountId)`. Delete the avatar `prisma.user.update`.
  - In `jwt`, when `account?.provider === "discord"`: set `token.id = account.providerAccountId`, keep the `token.discord` grant from Task 1, call `exchangeToken(account.providerAccountId, user.name ?? "Unknown")` without a try/catch (a failure must fail sign-in), then `getMe(issued.secret)` and set `token.personId = me.person?.id`.
  - Delete the `getValidXvmApiToken` refresh block and the `prisma.account.findFirst` fallback. Re-exchange is covered by the credential-cache plan.
  - Keep `session` copying only `id` (and `personId` if a page needs it).

- [ ] **Step 4: Types.** Add `personId?: number` to `JWT`.

- [ ] **Step 5: Verify.** `cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm run lint`

- [ ] **Step 6: Live check** against a local xvm-api (see `docs/LOCAL_DEV.md`): sign in with a Discord account that has never signed in, confirm there is no `users` row afterwards, confirm `/dashboard` renders and the guild picker works.

## Task 4: Retire old sessions once

An old JWT carries a cuid in `token.id`. Honouring it would key every gate and cache lookup on a value that no longer means anything.

- [ ] **Step 1:** In `authOptions.cookies`, change the production `sessionToken.name` from `__Secure-next-auth.session-token` to `__Secure-next-auth.session-token-v2`.
- [ ] **Step 2:** Add a test that asserts the name, and a one-line note in the commit that this signs everyone out once. This lands in the window, where everyone already relinks the plugin.

## Task 5: Delete the models

**Precondition:** no `prisma.*` call remains anywhere in `apps/web` outside generated code and the schema.

- [ ] **Step 1:** Remove `User`, `Account`, `Session`, `VerificationToken` from `prisma/schema.prisma` together with every remaining model (this is the last step of the whole decommission, not just this plan).
- [ ] **Step 2:** Remove `@next-auth/prisma-adapter`, `prisma` and `@prisma/client` from `package.json`, delete `lib/prisma.ts` and `prisma.config.ts`, and run `pnpm install`.
- [ ] **Step 3:** `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm run lint && pnpm run build`

## Window data that this plan adds to the manifest

Decision 2 listed `discordId`, `displayName`, `email` and `image`. Prod `users` also holds:

- **`isAdmin`** (1 user) maps to `Person.is_platform_admin`. Without it the platform admin loses admin rights.
- **`displayName` wins over `name`.** 33 of the 41 people who set one changed it from their Discord name, so `Person.display_name` is `displayName` when set, else `name`.
- **`settings.notifications`** (11 users) has no home. Same question as the venue notification toggles.

## Asks for xvm-api (Allegro)

1. A display name on the entry rows (`discord_user_id` entries) so the dashboard does not need a users table to show who they are.
2. A home for per-person notification preferences (11 prod users).
3. A person delete or anonymise endpoint, for the account page's "delete my account".
4. A public owner name, avatar and join date on the public venue payload.
5. Whether a pairing-code screen belongs on the dashboard (the route needs a person credential) or in xvm-bot.

## Self-review

- Spec coverage: the goal (no Prisma in sign-in) maps to Tasks 1, 3, 4, 5; the readers that block it are tabled in Task 2; the manifest gaps are listed.
- Placeholders: Task 2 deliberately has no code. It is a table of blocked work with the reason, not a TBD inside a task.
- Consistency: `DiscordGrant`, `discordGrantFrom`, `token.discord` and `token.personId` are used with the same names in every task.
