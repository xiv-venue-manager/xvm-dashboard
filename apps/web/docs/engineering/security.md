# Security

> Companion to [CASE_STUDY.md](../../CASE_STUDY.md). The case study summarizes one vignette; this doc walks the full audit.

## Threat model

Solo-built B2C app for a niche gaming community. The realistic adversaries:

| Adversary                | Capability                                                      | What they want                                             |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| **Scraper / bot**        | High-volume HTTP traffic, no logged-in account                  | Public venue data, any unauthenticated info                |
| **Malicious user**       | Has a valid account, has an API key, knows their `userId`       | Other venues' data, other users' API keys, role escalation |
| **Disgruntled ex-staff** | Was a venue member, got removed                                 | Continued read access to venue data                        |
| **Key thief**            | Obtained a plugin API key (logged accidentally, leaked in chat) | Make calls as the victim                                   |

What's _not_ a serious adversary for this app:

- Nation-state attackers (no high-value data)
- Sophisticated SQL injection (Prisma ORM, parameterized everything)
- XSS injection at scale (no user-rendered HTML, no comments, no rich text)

This shapes which findings get fixed urgently and which can defer.

## Audit findings

A line-by-line review six months in produced **18 findings**: 4 Critical, 6 High, 7 Medium, 5 Low. Below is the full list with status as of 2026-04-26.

### Critical (4 of 4 fixed)

| ID  | Finding                                                            | Status                                                                                                                                                               |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Plugin API keys stored as plaintext in DB                          | ✅ Fixed: `keyHash` column, SHA-256 lookup, raw key shown once at creation. Migration handled gracefully so existing plugin users didn't get logged out mid-session. |
| C2  | Secrets baked into `docker-compose.yml` (literal values)           | ✅ Fixed: `env_file: .env` + `${VAR}` interpolation                                                                                                                  |
| C3  | Same as C2 for cron container                                      | ✅ Fixed alongside C2                                                                                                                                                |
| C4  | `Dockerfile` had `COPY .env .env` baking secrets into image layers | ✅ Fixed: removed; `.env` is mounted at runtime, never built in                                                                                                      |

### High (6 of 6 fixed)

| ID  | Finding                                                                                             | Status                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| H1  | No rate limiting anywhere                                                                           | ✅ Fixed: ioredis-backed sliding window on plugin + dashboard routes                                                      |
| H2  | Auth endpoints unrestricted                                                                         | ✅ Fixed: `signin`/`callback` paths throttled to 10/min/IP, polled paths exempt                                           |
| H3  | Hardcoded fallback API key for the homepage stats endpoint                                          | ✅ Fixed: now requires `HOMEPAGE_API_KEY` env var; no fallback. Verified history search: literal key was never committed. |
| H4  | IDOR in feedback GET (any auth'd user could read any feedback by ID)                                | ✅ Fixed: query scoped to `session.user.id`                                                                               |
| H5  | Venue queries didn't filter by `Membership.status: "active"`, so revoked staff retained read access | ✅ Fixed: 40 queries across 20 routes patched                                                                             |
| H6  | Cron endpoints leaked `String(error)` to response body, exposing internal error shape               | ✅ Fixed: removed; debug auth logging also stripped                                                                       |

### Medium (most fixed, two deferred with reason)

| ID  | Finding                                             | Status                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | No rate limit on auth flow                          | ✅ Fixed (see H2)                                                                                                                                                                                                                                                                                                                                                            |
| M2  | Manager could self-promote to OWNER via PATCH       | ✅ Fixed: role escalation check looks at `role`, `temporaryRole`, `permanentRole`                                                                                                                                                                                                                                                                                            |
| M3  | `withAuthAndRateLimit` dead code                    | ✅ Removed                                                                                                                                                                                                                                                                                                                                                                   |
| M4  | CSP allows `unsafe-eval` and `unsafe-inline`        | ✅ Fixed 2026-05-07: nonce-based CSP implemented in `proxy.ts`. Per-request nonce stamped on every Next.js-generated `<script>` tag. `unsafe-inline` and `unsafe-eval` removed from `script-src`. CSP moved from `next.config.ts` (static, per-build) to `proxy.ts` (per-request, required for nonce generation). `style-src unsafe-inline` retained - required by Tailwind. |
| M5  | Invite token GET requires no auth, leaks venue name | ❌ Dismissed: intentional UX. Anyone joining will see the venue name regardless. Not a real leak.                                                                                                                                                                                                                                                                            |
| M6  | Database password is weak (`venue_db_pass_2026`)    | ✅ Fixed 2026-05-07: rotated to 64-char hex (`openssl rand -hex 32`). ALTER USER ran before .env update to avoid downtime window. Stored in Proton Pass.                                                                                                                                                                                                                     |
| M7  | SSH password auth enabled                           | ✅ Fixed: ed25519 keys only, password auth disabled in `sshd_config.d/10-disable-password.conf`                                                                                                                                                                                                                                                                              |

### Low (most fixed)

| ID  | Finding                                                                                       | Status                                                                                                  |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| L1  | No `npm audit` in CI                                                                          | ✅ Fixed: `.github/workflows/security.yml` runs `npm audit --audit-level=high` on push/PR + weekly cron |
| L2  | NextAuth `debug` mode fell back to `NODE_ENV` check, untrusted in containers                  | ✅ Fixed: now requires explicit `NEXTAUTH_DEBUG=true`                                                   |
| L3  | `new PrismaClient()` instantiated in 4 plugin routes (connection leak risk under concurrency) | ✅ Fixed: shared singleton in `lib/prisma.ts`                                                           |
| L4  | Stray `.bak` files containing schema in repo                                                  | ✅ Fixed: moved to `~/backups/`, cleaned from working tree                                              |
| L5  | Verbose error responses in some non-cron routes                                               | ✅ Fixed alongside H6 sweep                                                                             |

## Two illustrative fixes

### The keyhash migration

C1 was non-trivial because the fix could have logged out every active plugin user. Naive approach: add `keyHash` column, change `validateApiKey` to look up by hash, deploy. Existing keys have `NULL keyHash` → no lookups match → all plugin traffic dies until users regenerate keys (which they can't, because the plugin can't sign in to do it).

The actual roll-out:

1. Add nullable `keyHash` column
2. Backfill: hash every existing key, write to its `keyHash` column
3. Deploy `validateApiKey` to look up by `keyHash` (not `key`)
4. Soak window: monitor `lastUsedAt` to confirm all active keys are still working
5. Drop the `key` column (still pending; deferred low-risk cleanup)

The seam between steps 2 and 3 is the only window where a race could hurt: a request arriving between hash-write and code-deploy would still go through the old plaintext path. The sequence ordering eliminates that window.

### The plugin RL ordering bug (post-audit)

The audit said "rate limiting is fixed." Then a follow-up test exposed an ordering bug: the rate limit check ran _after_ `validateApiKey()`. So bad/missing keys returned 401 before any counter incremented, leaving the keyspace open to unthrottled brute-force probing. Each probe still cost a database lookup (lookup-by-hash), so this was both a security bug and a DoS vector.

```
Before fix:                  After fix:
1. validate key              1. enforcePluginIpRateLimit  ← per-IP, 60/min
2. enforcePluginRateLimit    2. validate key
3. handler                   3. enforcePluginRateLimit    ← per-key, 120/min
                             4. handler
```

Verified with an 80-request burst from a single IP using `x-forwarded-for: 10.20.30.40`:

```
60 401   (no key sent, IP counter incrementing)
20 429   (IP cap hit)
```

Two layers run on every authenticated request: the IP throttle catches credential stuffing, the per-key throttle catches a compromised legitimate key. Per-IP comes first specifically because it can short-circuit before any DB work.

## Security infrastructure summary

| Layer                    | Implementation                                                                                                       | File                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Plugin auth**          | `vm_<nanoid>` keys, SHA-256 hashed at rest                                                                           | `lib/api/plugin-auth.ts`              |
| **Plugin rate limit**    | Per-IP (60/min) + per-key (120/min read, 60/min write)                                                               | `lib/api/plugin-rate-limit.ts`        |
| **Browser auth**         | NextAuth + Discord OAuth, JWT sessions                                                                               | `lib/auth.ts`                         |
| **OAuth flow throttle**  | 10/min/IP on `signin`/`callback`, exempt polled paths                                                                | `app/api/auth/[...nextauth]/route.ts` |
| **Web route rate limit** | Per-IP, per-route budgets                                                                                            | `lib/middleware/with-rate-limit.ts`   |
| **Permission model**     | Membership-based with role + status check                                                                            | `lib/permissions.ts`                  |
| **CSP**                  | Nonce-based per-request CSP; `script-src 'self' 'nonce-{n}'`; no `unsafe-inline`/`unsafe-eval`                       | `proxy.ts`                            |
| **Headers**              | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS | `next.config.ts`                      |
| **Build-time scan**      | `npm audit --audit-level=high` in CI                                                                                 | `.github/workflows/security.yml`      |

## What I learned

1. **Audits are checklists; verification is sequential reasoning.** "Rate limiting exists" passed the checklist. "Rate limiting runs before the expensive operation it's protecting" did not. Test the _invariant_, not the _presence_.
2. **Document deferrals with their re-trigger.** Every `⏸ Deferred` line above has a "trigger to revisit" condition. Without it, deferrals become permanent.
3. **Threat model first, then prioritize.** Strict CSP is "best practice." For an app with no user-rendered HTML, it's premature. The same hour of work could close higher-likelihood holes elsewhere.
4. **Some findings are not real findings.** M5 (invite token leaks venue name) was dismissed because anyone joining the venue sees the name anyway. Auditors find what's there; humans decide what matters.

For the deeper architecture this defends, see [architecture.md](./architecture.md). For the scaling decisions that affect security posture (e.g. rate limit budgets), see [scaling.md](./scaling.md).
