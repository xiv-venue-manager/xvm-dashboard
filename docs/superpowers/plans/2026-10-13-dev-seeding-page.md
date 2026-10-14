# Dev Seeding Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a local database reset from invalidating the dashboard, bot and worker credentials, and give a logged-in dev dashboard one page that says what is in the local database and seeds more of it.

**Architecture:** Three pieces that land in order and are useful separately. First, `api.scripts.seed` carries the unscoped service credentials across the drop instead of minting new ones, and `people.seed` issues a service credential only for a client that has none, so the two halves cannot leave two live keys per client. Second, the sequences behind `seed_venue` and `seed_staff` move into `api/services/seeding.py`, and a new `routers/dev.py` exposes them plus one read, refused unless the database is local and the caller is a platform admin. Third, a dashboard page reads the state and posts the two forms, rendered only outside production.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest (no alembic revision — nothing in the schema changes); Next.js App Router route handlers and server components, TypeScript, vitest.

---

Status: proposed, 2026-10-13. Nothing built yet.

## Why

Three separate frictions in the local loop, which is the only place any of this runs.

**A reset costs three reconfigurations and a restart.** `api.scripts.seed` mints every credential fresh and prints the secrets once. Its own docstring says the printed keys "replace the ones the bot, dashboard and worker were configured with." The dashboard reads `XVM_API_DASHBOARD_SERVICE_TOKEN` at module scope (`apps/web/lib/api/xvm-api.ts:4`), so a rotated key costs an `.env` edit *and* a dev-server bounce, and the bot and worker want the same treatment.

**Nothing says what is in the local database.** The reset prints the venues, the five personas and their Discord ids to stdout, once. After that the only way to find out which persona you are logged in as, or which Discord id to log in as to see a different tier, is to read rows.

**The additive scripts take argument lists you retype.** `seed_venue` wants a name, data centre, world, owner Discord id, owner name and optionally a guild id; `seed_staff` wants a venue, repeated positions, a member, repeated assignments and repeated `Name=Position` services.

## Scope

**In scope**

- Preserving the three service credentials (bot, dashboard, worker) across `api.scripts.seed`, with a flag for the old behaviour.
- A `/dev` router in xvm-api: one read of the seeded state, one endpoint per additive seed.
- Moving the two additive sequences into a service both the CLI and the routes call.
- A dev-only dashboard page: current state, and a form per additive seed.

**Out of scope, on purpose**

- **Triggering the full reset from the page.** Preserving the service credentials fixes the configuration half, not this: the reset drops the `people` row the caller is authenticated as, so the caller's own identity disappears part-way through its own request. It stays a command you run in a terminal where you can read what it printed.
- **A tick-box menu over the ten `seed/` modules.** Each is `seed(session, seeded)` and reads `seeded.people["owner"]`, `seeded.venues`, `seeded.events[venue.id, "past"]` — objects the earlier modules just created in memory, not rows it looks up. `finance` needs `events`, `events` needs `venues`, `venues` needs `people`. Selecting them individually means rewriting all ten to resolve their dependencies from the database, which is a larger job than the rest of this plan and buys little over the full reset.
- **Any seeding against a non-local database.** D1 refuses it, and nothing here weakens the `_is_local` guard the destructive script already has.
- **Credential rotation convenience.** This plan stops a reset invalidating the keys; it does not add a way to roll one deliberately. `api.scripts.issue_credential` already does that.

## Decisions

| | | |
|---|---|---|
| D1 | **The gate is the reset's own locality test, not a new setting.** `/dev` refuses unless `_is_local(engine.url)` (`api/scripts/seed/__main__.py:39-42`) — a SQLite file, or Postgres on `localhost`, `127.0.0.1` or `::1` — and the caller holds `SCOPE_PLATFORM_ADMIN`. No new configuration to misconfigure, and it reuses the predicate that already stands between the destructive script and a remote database. **Known limitation:** an API pointed at Postgres on a compose hostname (`db`, `postgres`) is not local by this test and loses the `/dev` routes entirely. Accepted, because the alternative is a settings flag that a deploy can switch on by accident, and `docs/LOCAL_DEV.md:95-108` runs the API on the host against SQLite. | Decided |
| D2 | **A new `/dev` router rather than more of `/internal`.** `/internal` gates on client kind (`_bot_only`, `_worker_only`) and means "a service client, not a person". These routes are the opposite: a human in a browser, holding a person token. | Decided |
| D3 | **Service credentials are preserved by default; `--rotate-credentials` restores the old behaviour.** The three service credentials are issued together in `api/scripts/seed/people.py:66-68` with `person_id` and `venue_id` both NULL, so they hold no foreign key into anything the reset drops and can be re-inserted with their hashes intact. The plugin credentials are person-scoped and are still minted fresh, because their `person_id` goes with the people. Default chosen this way round because the pain lands on the run where you forget the flag. | Decided |
| D4 | **`people.seed` issues a service credential only for a client that has no live one.** Without this, D3 leaves two live keys per client after every reset. It also matches what the additive scripts already document about themselves — "a position, person, membership, service or grant that already exists is reused". | Decided |
| D5 | **One definition of each additive seed, in `api/services/seeding.py`, called by both the CLI and the route.** A route importing from `api.scripts` would invert the layering, and two copies of the sequence would drift until the page seeded something subtly different from the command. The scripts become argument parsing around a call. | Decided |
| D6 | **The endpoints take structured input; the CLI keeps parsing its own.** `seed_staff`'s `--service "Old Fashioned=Bartender"` becomes `{"name": ..., "position": ...}` on the wire, and the CLI splits its own `Name=Position` form into the same shape before calling the service. The page should not have to build a CLI string. | Decided |
| D7 | **`GET /dev/state` returns what the reset prints, minus every secret.** Venues as id, name and slug; people as id, display name, Discord id and whether they are a platform admin. No credential secrets, ever: the server keeps only hashes, and `preview` is enough to tell one key from another if that is ever wanted. | Decided |
| D8 | **No alembic revision.** Nothing in the schema changes. The credential rows are snapshotted and re-inserted through the existing model. | Decided |

## File structure

### xvm-api

| File | Responsibility |
|---|---|
| Modify `src/api/scripts/seed/__main__.py` | Snapshot the unscoped service credentials and their scopes before `_drop_all`, re-insert them after `_upgrade`, and add `--rotate-credentials`. Report which keys were kept rather than printing secrets it no longer minted. |
| Modify `src/api/scripts/seed/people.py` | Issue a service credential only for a client with no live one (D4). |
| Create `src/api/services/seeding.py` | `seed_venue(session, spec)` and `seed_staff(session, spec)` — the two additive sequences, lifted from the scripts unchanged. |
| Modify `src/api/scripts/seed_venue.py` | Parse arguments into the spec and call the service. |
| Modify `src/api/scripts/seed_staff.py` | Same, including splitting `Name=Position` (D6). |
| Create `src/api/schemas/dev.py` | `DevState`, `DevVenueRow`, `DevPersonRow`, `SeedVenueRequest`, `SeedStaffRequest`, `ServiceGrant`. |
| Create `src/api/routers/dev.py` | `GET /dev/state`, `POST /dev/seed/venue`, `POST /dev/seed/staff`, behind the D1 gate. |
| Modify `src/api/main.py` | Register the router. |
| Create `Tests/test_dev_routes.py` | The gate (both halves), the read, and both writes including re-running. |
| Modify `Tests/test_seed.py` | Credentials kept by default, rotated with the flag, and no duplicate service credential after two runs. |

### Dashboard

| File | Responsibility |
|---|---|
| Modify `apps/web/lib/api/xvm-api.ts` | `getDevState`, `seedDevVenue`, `seedDevStaff` and their row types. |
| Modify `apps/web/lib/api/xvm-api.test.ts` | One test per call. |
| Create `apps/web/lib/dev-seed-state.ts` | Pure form rules: required fields, the `Name=Position` display form, which assignments are offerable given the positions entered. |
| Create `apps/web/lib/dev-seed-state.test.ts` | Unit tests for the above. |
| Create `apps/web/app/api/dev/state/route.ts` | Proxy the read. |
| Create `apps/web/app/api/dev/seed/venue/route.ts` | Proxy the venue seed. |
| Create `apps/web/app/api/dev/seed/staff/route.ts` | Proxy the staff seed. |
| Create `apps/web/app/api/dev/*/route.test.ts` | Gate, validation and xvm-api refusal per route. |
| Create `apps/web/app/dashboard/dev/page.tsx` | The page: state, then a form per seed. |
| Create `apps/web/components/dev-seed-forms.tsx` | The two forms. |
| Modify `docs/SHARED_ASSETS.md` | A row for `dev-seed-state` under Helpers and one for `dev-seed-forms` under Feature components, per `CLAUDE.md`'s shared-assets rule. |

## PR slices

One worktree and one PR per slice (`CLAUDE.md`), in this order. Task 1 is independent of everything else and worth landing on its own. Task 4 needs Tasks 2 and 3.

| PR | Repo | Tasks |
|---|---|---|
| A | xvm-api | Task 1 |
| B | xvm-api | Tasks 2 and 3 |
| C | Dashboard | Task 4 |

---

### Task 1: A reset keeps the service credentials

**Files:** `src/api/scripts/seed/__main__.py`, `src/api/scripts/seed/people.py`, `Tests/test_seed.py`

- [ ] **Step 1: Write the failing tests.** Three cases. A reset leaves the dashboard service credential usable: issue one, note its `secret_hash`, reset, assert a credential with that hash is live and unrevoked. `--rotate-credentials` does not: the hash is gone and a new one exists. Two resets in a row leave exactly one live service credential per client, which is the D4 case and the one that fails loudest if the two halves disagree.
- [ ] **Step 2: Run them to verify they fail.** `uv run pytest Tests/test_seed.py -k credential`.
- [ ] **Step 3: Snapshot and restore in `__main__.py`.** Before `_drop_all`, select credentials where `person_id IS NULL AND venue_id IS NULL AND created_by_person_id IS NULL AND revoked_at IS NULL`, with their `scopes`, into plain tuples — not ORM instances, which would be attached to a session whose tables are about to vanish. All three FK columns are in the filter so the rows provably carry nothing into the rebuilt schema: `CredentialModel` has exactly those three (`models/credentials.py:24,28,42`), and neither `seed/people.py` nor `scripts/issue_credential.py` passes `created_by_person_id`. A venue- or person-scoped credential is therefore left to be re-minted, which is right — its owner's id changes with the reset. After `_upgrade`, re-insert the rows and their scope rows. Skip entirely when `--rotate-credentials` is passed.
- [ ] **Step 4: Make the issue idempotent in `people.py`.** Issue a service credential only for a client with no live one.
- [ ] **Step 5: Report honestly.** The closing output should distinguish a key it minted from one it kept, because a printed secret the reader cannot act on is worse than a line saying the old one still works.
- [ ] **Step 6: Run the tests to verify they pass.** Then the whole suite on both backends (`parallel-suites`).
- [ ] **Step 7: Acceptance.** With the dashboard running against a seeded SQLite database, reset it and reload the dashboard **without touching `.env` or restarting**. It should still reach xvm-api. That is the entire point of the task and no unit test can show it.
- [ ] **Step 8: Commit.**

### Task 2: The `/dev` router and the state read

**Files:** `src/api/schemas/dev.py`, `src/api/routers/dev.py`, `src/api/main.py`, `Tests/test_dev_routes.py`

- [ ] **Step 1: Write the failing gate tests.** A remote Postgres URL gets a refusal from every `/dev` route; a local URL with a non-admin principal gets 403; a local URL with a platform admin gets 200. The first of these is the test that matters, so write it against all three routes rather than one.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Write the gate.** A dependency that applies `_is_local` to the live engine URL and then `SCOPE_PLATFORM_ADMIN`. `_is_local` moves out of `seed/__main__.py` to somewhere both it and the router can import, keeping one definition (it is currently private to the script).
- [ ] **Step 4: Write `GET /dev/state`.** Venues and people per D7. No secrets.
- [ ] **Step 5: Run the tests to verify they pass.**
- [ ] **Step 6: Typecheck and lint.** `uv run mypy` and `uv run ruff check`.
- [ ] **Step 7: Commit.**

### Task 3: Shared additive seeds and their endpoints

**Files:** `src/api/services/seeding.py`, `src/api/scripts/seed_venue.py`, `src/api/scripts/seed_staff.py`, `src/api/routers/dev.py`, `Tests/test_dev_routes.py`

- [ ] **Step 1: Write the failing endpoint tests.** Seeding a venue creates the venue and matches-or-creates the owner by Discord id; seeding it again with the same Discord id reuses the person and adds a second venue; a guild id already linked elsewhere refuses the whole thing. Then the staff equivalents: positions created, member holds only the assigned ones, services granted to the right positions, and a re-run adds rather than refuses.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Lift the sequences into `api/services/seeding.py`.** Move the bodies out of the two scripts' `_run` functions without changing what they do. The scripts keep their argument parsing, their `HTTPException`-to-stderr handling and their "says which database" line.
- [ ] **Step 4: Verify the scripts still work from the shell.** Run both against a scratch SQLite file with the invocations from their own docstrings. A refactor that quietly breaks the CLI defeats the point of sharing one definition.
- [ ] **Step 5: Write the two endpoints.** Thin: validate, call the service, return the created rows.
- [ ] **Step 6: Run the tests to verify they pass.** Then the whole suite on both backends.
- [ ] **Step 7: Typecheck and lint. Commit.**

### Task 4: The dashboard page

**Files:** the Dashboard rows in the file structure table

- [ ] **Step 1: Write the failing client tests.** One per `xvm-api.ts` call, following the existing harness in that file's test.
- [ ] **Step 2: Write the failing form-rule tests.** `lib/dev-seed-state.ts` holds anything worth asserting, because `apps/web` has `environment: "node"` and no jsdom, so the components themselves cannot be tested. Keep the untestable layer as thin as it will go — this is the lesson from #195, where the one bug landed in exactly the part the extraction left untested.
- [ ] **Step 3: Run both to verify they fail.**
- [ ] **Step 4: Add the client calls and the form rules.**
- [ ] **Step 5: Write the three route handlers.** Each refuses outside development before anything else, then `requirePlatformAdmin` (`lib/admin-access.ts`, #111), then rate limiting, then the proxy. Tests assert the ordering, not just the status, so a non-admin cannot probe the shape.
- [ ] **Step 6: Write the page and the forms.** Not linked from any navigation; it is a URL you know.
- [ ] **Step 7: List the two new pieces in `docs/SHARED_ASSETS.md`.** A row for `dev-seed-state` under Helpers with its real exports, and one for `dev-seed-forms` under Feature components, matching the shape of the `discord-picker-state` and `user-picker` rows. Same PR, per `CLAUDE.md`.
- [ ] **Step 8: Run the suite, typecheck, lint.**
- [ ] **Step 9: Acceptance, in a browser.** Load `/dashboard/dev` as the seeded owner: the state matches what the reset printed. Seed a venue and see it appear in the venue list. Seed staff onto it and see the positions and services on the venue's own pages. Then confirm the page 404s for a non-admin.
- [ ] **Step 10: Commit.**

---

## Acceptance

- A reset no longer costs an `.env` edit or a restart for the dashboard, and the bot and worker keys in their own configuration still work.
- Two resets in a row leave one live service credential per client, not two.
- `/dev` answers nothing at all when the database is not local, proven by a test rather than by inspection.
- The page says which persona each Discord id logs in as, which is the thing currently only available in stdout from a command that has already scrolled away.
- Both additive seeds do the same thing from the page as from the shell, because there is one definition of each.
