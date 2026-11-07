# Meet the team: curated roles and groups (follow-on plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the free-text `role_title` and `group_label` with admin-curated lists of roles and groups. A person has one or more roles and exactly one group. Admins add, rename, reorder and remove list items, and removal of an item in use is refused.

**Spec (source of truth):** `docs/superpowers/specs/2026-10-29-meet-the-team-design.md`, section "Roles and groups" and the endpoint table. Read it first.

**Builds on, does not redo:** `2026-10-29-team-page-xvm-api.md` and `2026-10-29-team-page-dashboard.md`. Both are already implemented and committed on branch `feat/team-page` in `~/xvm-api-team` and `~/xvm-dashboard-team`. This plan changes that code. Nothing is pushed, so the `team_members` migration is rewritten in place.

**Style of this plan:** each task states exact behaviour, files and the tests that must exist, and leaves the code to the implementer, who must read the surrounding code first and follow its conventions. Where a shape matters it is written out.

**Conventions to keep (from the earlier plans):**
- xvm-api: routers are auto-registered; each router has its own `_person_or_403`/`_admin_or_403`; a 409 without a code must come from a route whose `responses[409]` has no `x-codes`; `contract/openapi.json` is committed and must be regenerated; the guard tests in `Tests/test_account_deletion.py` and `Tests/test_person_merge.py` (including the person-FK count) must stay green.
- Dashboard: route handlers mirror `app/api/admin/announcements`; vitest is node-only so logic lives in `lib/` helpers; lint baseline is 0 errors and 6 existing warnings; `apps/web/AGENTS.md` warns this is Next 16 with breaking changes, check `node_modules/next/dist/docs` before relying on any API; `vitest.config.ts` already sets `XVM_API_BASE_URL`.
- No inline comments explaining WHAT code does. No amend or reset; fix mistakes with a new commit. No pushing.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## Part A: xvm-api (`~/xvm-api-team`, run `uv run ...`)

### Task A1: Data model, migration, reads, seed

**Files:** `src/api/models/team.py`, `alembic/versions/7c3a9e41d2b8_team_members.py` (rewritten in place), `src/api/schemas/team.py`, `src/api/services/team.py`, `src/api/routers/public.py` (the `/team` route), `src/api/routers/team.py` (`_profile` and the member reads), `src/api/scripts/seed/platform.py`, `Tests/test_team.py`, `Tests/test_seed.py` only if it needs it.

- [ ] **Model.** Add `TeamGroupModel` (`name` string(40), `sort_order` int) and `TeamRoleModel` (`name` string(80), `sort_order` int); names unique ignoring case (follow the `func.lower` unique `Index` pattern in `models/people.py`). `TeamMemberModel` drops `role_title` and `group_label`, gains `group_id` (FK `team_groups.id`, `ON DELETE RESTRICT`, not null). Add `TeamMemberRoleModel` with composite primary key `(member_id, role_id)`, `member_id` FK `team_members.id` `ON DELETE CASCADE`, `role_id` FK `team_roles.id` `ON DELETE RESTRICT`. Add a `roles` relationship on the member (ordered by role `sort_order`, then id) or an equivalent query in the service; pick the one that avoids N+1 on the roster.
- [ ] **Migration.** Rewrite `7c3a9e41d2b8_team_members.py` in place (same revision id and `down_revision`): create all four tables with explicit constraint names following the existing naming convention, and the lower-name unique indexes. `downgrade` drops them in dependency order. Prove it on SQLite: `Tests/test_*` already contains a migration round-trip test that must still pass; also run `uv run alembic upgrade head`, `downgrade -1`, `upgrade head` against a throwaway SQLite file.
- [ ] **Schemas.** `PublicTeamMember`: `name`, `roles: list[str]`, `group: str`, `bio`, `photo_url`. `TeamProfile`: `name`, `roles: list[str]`, `group: str`, `bio`, `photo_url`, `listed`. `AdminTeamMember`: `person_id`, `name`, `role_ids: list[int]`, `roles: list[str]`, `group_id: int`, `group: str`, `bio`, `photo_url`, `sort_order`, `listed`. Create/update schemas arrive in Task A3; for now keep `TeamMemberCreate`/`Update` compiling with the new fields (`role_ids`, `group_id`).
- [ ] **Service/reads.** `TeamService.roster` orders by group `sort_order`, then member `sort_order`, then id, and returns each member's role names in role order and the group name. `GET /public/team`, `GET /me/team-profile`, `PATCH /me/team-profile`, the photo route and the admin read must all return the new shapes. Avoid one query per member for roles.
- [ ] **Seed.** Seed `Builders` and `Testers` groups, roles `Developer`, `API Developer`, `Tester`, `Community Tester`, and the five team cards from before, one person with two roles (for example `API Developer` and `Tester`) to exercise multi-role.
- [ ] **Tests.** Adapt every existing test in `Tests/test_team.py` that used `role_title`/`group_label` (fixtures included) to the new model, keeping each test's intent. Add: public order follows group position then member order; a person's roles come back in role-list order; two roles render for a multi-role person; every response uses the new keys and none of the old ones.
- [ ] **Verify and commit.** `uv run pytest Tests/test_team.py Tests/test_seed.py Tests/test_account_deletion.py Tests/test_person_merge.py -q`, `uv run ruff check src Tests`, `uv run mypy src`. Commit: `feat(team): roles and groups as lists, roles per person`.

### Task A2: Role and group catalogue endpoints

**Files:** `src/api/routers/team.py`, `src/api/services/team.py`, `src/api/schemas/team.py`, `src/api/constants.py` if a limit is added, `Tests/test_team.py`.

- [ ] **Routes** (all platform-admin, same helper as the other admin team routes; implement once generically in the service for roles and groups, expose two route sets): `GET /admin/team/roles|groups` returns the list in position order, each item `{id, name, sort_order, member_count}`. `POST` takes `{name}` (1 to 80 or 40 characters, trimmed), adds at the end (`max(sort_order)+1`), returns the item; a name that already exists ignoring case is a 409 (plain, no `x-codes`). `PATCH /{id}` renames (same duplicate rule; 404 for an unknown id). `DELETE /{id}` returns 204, or a 409 `Used by N people.` if any member has it (a role in `team_member_roles`, a group on `team_members`), 404 for unknown. `PUT /order` takes `{ids: [...]}` that must be exactly the current set of ids, no more, no fewer, no repeats (else 422) and sets `sort_order` to each id's index in one change.
- [ ] **Route order.** Declare `PUT .../order` before the `/{id}` routes so `order` is not read as an id.
- [ ] **Tests:** non-admins 401/403 on every route; add, rename, duplicate-ignoring-case refused on add and on rename; list returns `member_count` accurately for roles and groups; delete unused works; delete used is refused with the count in the message and nothing changes; reorder applies the new order and the public page follows a reordered group list; reorder with a missing, extra or repeated id is a 422; 404s for unknown ids.
- [ ] **Verify and commit.** Tests, ruff, mypy as above. Commit: `feat(team): admins curate the roles and groups lists`.

### Task A3: Admin member endpoints take role ids and a group id

**Files:** `src/api/routers/team.py`, `src/api/services/team.py`, `src/api/schemas/team.py`, `Tests/test_team.py`.

- [ ] `POST /admin/team` takes `{person_id, role_ids (1 or more, no repeats), group_id (required), sort_order}`; a role or group id that does not exist is a 404; an empty or repeating `role_ids` is a 422. `PATCH /admin/team/{person_id}` takes any of `role_ids`, `group_id`, `sort_order`; `group_id` cannot be null (`_REQUIRED_COLUMNS`), `role_ids` cannot be empty; replacing roles replaces the whole set in one change. Members still cannot send roles, group or order on their own `PATCH /me/team-profile` (the existing 422 test must keep passing).
- [ ] **Tests:** add with two roles and a group returns both in list order; add with no roles, a repeated role, an unknown role or an unknown group is refused; change roles (add one, drop one) and group; changing the group moves the person between sections on the public page; null group and empty roles refused; removing a person removes their role links but not the roles.
- [ ] **Verify and commit.** Commit: `feat(team): admins set a person's roles and group from the lists`.

### Task A4: Contract, guard tests, full suite

- [ ] `uv run python -m api.scripts.export_openapi`, confirm with a semantic diff that the old team paths changed shape and the new catalogue paths were added and nothing unrelated changed. If any person-FK count or guard test moved, fix the test with a reasoned explanation in the commit. Run the whole suite in the background (it takes about 20 minutes): `uv run pytest -q`. Run `ruff` and `mypy`.
- [ ] Commit: `chore(contract): regenerate openapi for roles and groups`.

---

## Part B: dashboard (`~/xvm-dashboard-team`, run from `apps/web` with pnpm)

### Task B1: Client types and functions, routes, helpers

**Files:** `lib/api/xvm-api.ts` (team section at the end), `lib/api/xvm-api-team.test.ts`, `lib/team-groups.ts` and its test, `lib/team-multiselect.ts` and its test (new), `app/api/admin/team/route.ts` and `[personId]/route.ts` with their test, new `app/api/admin/team-catalogue/[kind]/route.ts`, `[kind]/[id]/route.ts`, `[kind]/order/route.ts`, with a test file for them.

- [ ] **Types.** `PublicTeamMember`: `name`, `roles: string[]`, `group: string`, `bio`, `photo_url`. `TeamProfile` adds `listed`. `AdminTeamMember` adds `person_id`, `role_ids`, `group_id`, `sort_order`. `TeamCatalogueItem`: `id`, `name`, `sort_order`, `member_count`. `TeamMemberCreate`/`Update` use `role_ids`, `group_id`.
- [ ] **Client functions** for `kind: "roles" | "groups"`: `listTeamCatalogue`, `addTeamCatalogueItem`, `renameTeamCatalogueItem`, `removeTeamCatalogueItem`, `reorderTeamCatalogue(ids)`. Update `addTeamMember`/`updateTeamMember` payloads. Tests assert URL, method and body for each.
- [ ] **Helpers.** `groupTeam` now groups by the `group` name in the order it first appears (the API already orders by group position) and has no "ungrouped" section; update its tests. `lib/team-multiselect.ts`: `toggleValue(selected: number[], id: number): number[]` (adds or removes, keeps no duplicates), `summarise(selected, options)` returning the text for the button (names joined by comma, or a placeholder when none, or "N roles" when the names would be long); test them.
- [ ] **Routes.** The catalogue routes validate `kind` is `roles` or `groups` (404 otherwise), validate bodies with zod (`name` 1 to 80 for roles, 1 to 40 for groups, trimmed; `order` takes `{ids: number[]}` of positive integers with no repeats), forward to xvm-api, pass its 409 `Used by N people.` message through, and call `refreshTeamPage()` after a successful write (a rename or reorder changes the public page). The person routes switch to `role_ids` (array of 1 or more positive integers, no repeats) and `group_id` (positive integer, required on add). Route tests: signed-out 403, validation 400 with no API call, forwarding, 409 pass-through, `refreshTeamPage` called only after success.
- [ ] **Verify and commit.** `pnpm vitest run lib app/api`, `pnpm run typecheck`, `pnpm run lint`, `pnpm test`. Commit: `feat(team): dashboard client and routes for roles and groups`.

### Task B2: Shared MultiSelect

**Files:** `components/ui/multi-select.tsx` (new), `docs/SHARED_ASSETS.md`.

- [ ] Build `MultiSelect` on the shared `dropdown-menu` (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuCheckboxItem`). Props: `options: {value: number; label: string}[]`, `value: number[]`, `onChange(value: number[])`, `placeholder`, `disabled`, `id`/`aria-label`. The trigger is styled to match the shared `select` trigger (read `components/ui/select.tsx` for its classes and copy the look). Checkbox items use `onSelect={(e) => e.preventDefault()}` so the menu stays open while ticking several; use `toggleValue` and `summarise` from `lib/team-multiselect.ts`. Keyboard operable and labelled.
- [ ] Add a row to `docs/SHARED_ASSETS.md`'s UI primitives table for `multi-select`.
- [ ] Verify with typecheck and lint. Commit: `feat(ui): a shared MultiSelect on the dropdown menu`.

### Task B3: Public page, card and member edit screen

**Files:** `components/team-row.tsx`, `app/team/page.tsx`, `app/team/edit/page.tsx`.

- [ ] `TeamRow` shows `roles` as a wrapping row of chips (same chip style as now), in the order given. `app/team/page.tsx` uses `group` for the section heading, with no unlabelled section. `app/team/edit/page.tsx` reads "Your roles: A, B, in Group. An admin sets these." and the preview shows the chips. The preview and `TeamRow` take `roles: string[]`.
- [ ] Keep the layout decisions already made (photo left, fit-to-content with 22rem minimum, photo pinned to the top only when the text is taller, 64px top padding).
- [ ] Verify typecheck, lint, test. Commit: `feat(team): show several roles on a card`.

### Task B4: Admin screen

**Files:** `app/admin/team/page.tsx` (rewrite within the existing style: `page-inner max-w-3xl mx-auto`, `page-h1` with the `Users` icon, centred).

- [ ] Sections in order: (1) **Roles** and **Groups** panels side by side from `md`, stacked below, each listing items with up and down buttons (disabled at the ends; a click sends the new full order via the order route and updates the list), inline rename (edit then Enter or a Save button, with the duplicate-name 409 shown), a bin button disabled while `member_count > 0` with "Used by N people" beside the name, and an add box (Enter or button) at the bottom. (2) **Add someone**: the existing search (keeping the "no one matches" and the "type at least two letters of their name" messages and the stale-result clearing), then `MultiSelect` for roles and the shared `select` for group (no empty option), Add disabled until at least one role and a group are chosen; if there are no groups or no roles, say which to add first. (3) **Team list**: each row has name, roles `MultiSelect`, group `select`, order number input and Save, which shows a "Saved" tick for a couple of seconds, plus the removal confirmation as now.
- [ ] After any catalogue change that affects rows (rename, remove, reorder) reload the members list so names stay correct. Handle API errors by showing the returned message near the control that caused it.
- [ ] Verify typecheck, lint, test. Commit: `feat(team): admin screen manages roles and groups`.

---

## Part C: verification (controller, not an implementer)

- [ ] Rebuild the local API database for the new shape: stop the local API, `uv run python -m api.scripts.seed --yes` in `~/xvm-api-team` (this re-mints credentials), put the new dashboard service key into `~/xvm-dashboard-team/apps/web/.env.local` (local only, never committed), restart both servers with the media settings used earlier (`APIV2_MEDIA_DISK_PUBLIC_URL=http://127.0.0.1:8001`, static server on 8001, `MINIO_PUBLIC_URL=http://127.0.0.1:8001`). Re-upload the placeholder portraits, grant the user's person (Discord id ending `…967767553`, seeded as "Rana Reed") platform admin again, and ask them to sign out and back in.
- [ ] Click through: add, rename, reorder and try to remove used and unused roles and groups; add a person with two roles; change a group and watch the public sections move; reorder groups and watch the sections follow; empty states; 375px and 1280px.
- [ ] Re-run everything: API full suite, dashboard typecheck, lint and tests.
