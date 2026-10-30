# Retire the Venue Discord Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the dashboard's venue Discord webhooks (task created, task completed, staff joined, sale logged) and the settings that feed them, accepting a gap in venue notifications until the bot side delivers them.

**Architecture:** Pure removal. Four fire-and-forget sends go, with the Prisma venue lookups that existed only to find a webhook URL. The settings route and page lose the webhook fields. The shared `VenueSettings` type loses them. `lib/discord-webhook.ts` keeps only what other code still uses. The invite-accept route still needs a venue name and slug, so its Prisma lookup becomes the xvm-api one.

**Tech Stack:** Next.js 16, TypeScript strict, vitest in the node environment (no jsdom), zod.

Design and history: `docs/superpowers/specs/2026-09-23-discord-notifications-design.md` on branch `feat/retire-discord-webhooks` (Part 2 is this removal). Decision 2026-10-27 (user): remove now, accept the gap, and make "delivery ships" a gate on promoting `dev` to `main`. This supersedes the 2026-09-26 hold.

## Promotion gate (must be in the PR description)

The webhooks are removed from `dev` now. **`dev` is not promoted to `main` until the bot side delivers these venue notifications**, or the user explicitly accepts the gap for prod. Status on 2026-10-27: xvm-api has the log-routes endpoints (`/settings`, `/log-routes`) and a `LogEventKey` enum with exactly the six keys (`task.created`, `task.completed`, `staff.joined`, `event.imported`, `sale.logged`, `sales.daily_summary`), and xvm-api#98 and #20 are closed. Nothing emits those keys or posts them, and xvm-bot has no consumer (xvm-bot#12 is open). The "Discord notifications" settings section (spec Part 3) is built after delivery exists.

## Where this runs and conventions

Worktree `~/xvm-dashboard-webhooks`, branch `refactor/retire-venue-webhooks`, based on `origin/dev` at `5fee8359`. All commands run from `apps/web` unless a step says otherwise. Commit messages explain why and end with these two trailer lines in one block (use `git commit -F -`):

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EXEWEnJRN5CjgADgQMDYsH
```

No inline comments that explain what code does, and no em dashes in anything written.

## Deliberately not changed

- Venues' saved webhook URLs and toggles inside Prisma `Venue.settings` and the `discordWebhookUrl` column. They stay, unread, and no database operation runs. The `prisma.venue.update` in the settings route keeps merging the stored JSON, so nothing is wiped.
- The admin feedback webhook (`app/api/feedback/route.ts`, `sendDiscordWebhook`, `formatFeedbackSubmittedEmbed`). It is a platform alert, not a venue notification.
- `extractPartakeImages` and `extractPartakeTextBody` in `lib/discord-webhook.ts` (the event page uses them).
- `lib/discord-feed.ts` (`postNewVenue` to the retiring eorzea-bot).
- Landing page, owner guide and wizard copy that mention webhooks. They describe a feature that returns when delivery ships and the gate holds promotion until then, so editing them now only to restore them later is churn.
- The cron routes and the cron schedule. They are already gone from `dev`.

## File structure

- Modify `lib/api/transactions.ts`, `app/api/venues/[venueId]/tasks/route.ts`, `app/api/venues/[venueId]/tasks/[taskId]/route.ts` and their tests: remove the sends and venue lookups.
- Modify `app/api/invites/[token]/accept/route.ts` and its test: remove the send, resolve the venue through xvm-api.
- Modify `app/api/venues/[venueId]/settings/route.ts` and its test, and `app/dashboard/[slug]/settings/page.tsx`: remove the webhook config.
- Modify `packages/types/src/venue-settings.ts`, `packages/types/src/models.ts` if the field is unused, `lib/migration/venues.ts` and its test: drop the webhook fields from the types, keep the migration report counting them from the stored JSON.
- Modify `lib/discord-webhook.ts`, `lib/discord-webhook.test.ts`, and the stale comment in `app/dashboard/[slug]/tasks/page.tsx`.

---

### Task 1: Remove the sale, task-created and task-completed sends

**Files:**
- Modify: `lib/api/transactions.ts`, `lib/api/transactions.test.ts`
- Modify: `app/api/venues/[venueId]/tasks/route.ts`, `app/api/venues/[venueId]/tasks/route.test.ts`
- Modify: `app/api/venues/[venueId]/tasks/[taskId]/route.ts` and its test if one mentions webhooks

- [ ] **Step 1: Find the tests that assert the webhook behaviour.**

Run: `grep -n -i "webhook\|prisma\|discord" lib/api/transactions.test.ts "app/api/venues/[venueId]/tasks/route.test.ts"; ls "app/api/venues/[venueId]/tasks/[taskId]/"`. These tests currently mock `@/lib/prisma` and `@/lib/discord-webhook` and assert a send. Change them first, so they fail against the current code: replace each "sends a webhook" assertion with one that the route or helper does not import Prisma and never calls the webhook helper (use a `vi.mock("@/lib/prisma", () => { throw new Error("must not read Prisma") })` and a `vi.mock("@/lib/discord-webhook", ...)` that fails if a send is requested), and keep every other behavioural test. Remove tests whose only purpose was webhook routing (for example "does not send when the type is off").

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run lib/api/transactions.test.ts "app/api/venues/[venueId]/tasks"`
Expected: FAIL because the code still reads Prisma and still sends. Include the failing line in your report.

- [ ] **Step 3: `lib/api/transactions.ts`.**

Delete the Prisma lookup at the top of `createTransaction`:

```ts
  const venue = await prisma.venue.findUnique({
    where: { xvmApiVenueId },
    select: { discordWebhookUrl: true, settings: true },
  })
```

Delete the whole webhook block, from the comment `// Discord webhook (fire-and-forget - never block the response)` through the closing `}` of `if (webhookUrl) { ... }` (it builds `venueSettings` and `webhookConfig`, calls `getWebhookUrlForType(webhookConfig, "saleLogged")`, builds the embed with `formatSaleLoggedEmbed` and calls `sendDiscordWebhook`). Keep `venueEventBus.emit(...)` and everything after it. Change the doc comment above `createTransaction` so it no longer says it fires the sale-logged Discord webhook. Then remove every import that is now unused (`prisma`, the four `@/lib/discord-webhook` names, `parseVenueSettings`, and `sanitizeDiscordContent` or `resolveDisplayName` only if nothing else in the file uses them: check with the compiler, do not guess). Variables such as `amountDollars`, `serviceForEmbed` and `resolvedStaffName` are still used by the SSE event and must stay.

- [ ] **Step 4: `app/api/venues/[venueId]/tasks/route.ts`.**

In the `POST` handler delete the block that starts `const venue = await prisma.venue.findUnique({ where: { xvmApiVenueId }, select: { discordWebhookUrl: true, settings: true } })` and ends with the closing `}` of `if (venue) { ... }` (it computes `webhookConfig`, calls `getWebhookUrlForType(webhookConfig, "taskCreated")`, `formatTaskCreatedEmbed` and `sendDiscordWebhook`). Keep `return NextResponse.json({ ...shape, category: data.category ?? null }, { status: 201 })`. Remove the `@/lib/discord-webhook` import block and the `prisma` import if nothing else in the file uses it.

- [ ] **Step 5: `app/api/venues/[venueId]/tasks/[taskId]/route.ts`.**

In the transition handler delete the whole `if (data.action === "complete") { ... }` block (the Prisma lookup, `webhookConfig`, `getWebhookUrlForType(webhookConfig, "taskCompleted")`, `formatTaskCompletedEmbed` and `sendDiscordWebhook`). Keep the `return NextResponse.json(await shapeAfterFetch(...))` after it. Remove the `@/lib/discord-webhook` import block, the `prisma` import, and `intToPriority` from the `task-convert` import only if the compiler shows it is now unused.

- [ ] **Step 6: Run the tests, typecheck and lint.**

Run: `npx vitest run lib/api/transactions.test.ts "app/api/venues/[venueId]/tasks"`, `npx tsc --noEmit`, `npx eslint lib/api/transactions.ts "app/api/venues/[venueId]/tasks"`
Expected: tests pass, no output from tsc or eslint (ignore `npm notice`).

- [ ] **Step 7: Prove no send remains in these files.**

Run: `grep -n -E "sendDiscordWebhook|getWebhookUrlForType|formatTaskCreatedEmbed|formatTaskCompletedEmbed|formatSaleLoggedEmbed|VenueWebhookConfig|prisma" lib/api/transactions.ts "app/api/venues/[venueId]/tasks/route.ts" "app/api/venues/[venueId]/tasks/[taskId]/route.ts"`
Expected: no output.

- [ ] **Step 8: Commit.**

Stage only the files above. Subject: "Stop sending sale and task notifications to venue webhooks". Body: the sends and the venue lookups that only found a webhook URL are gone, so these three files no longer read Prisma; venue notifications return through xvm-bot, and dev is not promoted until they do.

---

### Task 2: Invite accept, no webhook and no Prisma

**Files:**
- Modify: `app/api/invites/[token]/accept/route.ts`, and its test file (find it: `ls "app/api/invites/[token]/accept/"`)

- [ ] **Step 1: Update the tests first.**

The test mocks `@/lib/prisma` (`venue.findFirst`) and the webhook helpers. Change it so that: the route resolves the venue through `resolveMyVenue(session.user.id, membership.venue_id)` from `@/lib/api/venue-access` (mock that module); a successful accept returns `venue: { name, slug }` from it; when `resolveMyVenue` returns null **or rejects**, the response is still `success: true` with `venue: null` (the membership already exists, and a failed lookup must not turn a successful accept into an error, because the invite cannot be accepted twice); and Prisma is never imported (a throwing `@/lib/prisma` mock). Remove every webhook assertion.

- [ ] **Step 2: Run to see it fail.** `npx vitest run "app/api/invites/[token]/accept"` Expected: FAIL (still imports Prisma). Include the failing line.

- [ ] **Step 3: Edit the route.**

Replace the Prisma lookup and everything between it and the final `return` with:

```ts
    const venue = await resolveMyVenue(session.user.id, membership.venue_id).catch(() => null)

    return NextResponse.json({
      success: true,
      membership: { id: membership.id, role: membership.tier.toUpperCase() },
      venue: venue ? { name: venue.name, slug: venue.slug } : null,
    })
```

This removes the `if (!venue) { ... }` early return (the same shape is now produced by the single return), the webhook block, and `getMe`/`resolveDisplayName`. Keep `await invalidateCache(cacheKeys.userVenues(session.user.id))` before it. Imports: delete `prisma`, the `@/lib/discord-webhook` block, `resolveDisplayName`, and `getMe` (keep `acceptInvite`); add `import { resolveMyVenue } from "@/lib/api/venue-access"`.

- [ ] **Step 4: Run, typecheck, lint.** `npx vitest run "app/api/invites/[token]/accept"`, `npx tsc --noEmit`, `npx eslint "app/api/invites/[token]/accept"` Expected: pass, no output.

- [ ] **Step 5: Prove it.** `grep -n -E "sendDiscordWebhook|getWebhookUrlForType|formatStaffJoinedEmbed|prisma|getMe|resolveDisplayName" "app/api/invites/[token]/accept/route.ts"` Expected: no output.

- [ ] **Step 6: Commit.** Subject: "Stop announcing staff joins to venue webhooks and read the venue from xvm-api". Body: the staff-joined send is gone, and the route only needed Prisma for the webhook config and the venue name and slug, so the name and slug now come from the caller's own `/me/venues` (a lookup failure still returns success, since the invite is already accepted).

---

### Task 3: Remove the webhook settings from the route and the page

**Files:**
- Modify: `app/api/venues/[venueId]/settings/route.ts`, `app/api/venues/[venueId]/settings/route.test.ts`
- Modify: `app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Update the route test first.**

Find the webhook cases: `grep -n -i "webhook" "app/api/venues/[venueId]/settings/route.test.ts"`. Remove assertions that GET or PUT return or accept `discordWebhookUrl`, `webhooks` or `discordWebhooks`. Add: a PUT body that still carries `webhooks`, `discordWebhooks` and `discordWebhookUrl` is accepted but none of them reaches `prisma.venue.update`'s `data` (zod strips them) and the stored JSON is not wiped (the update still merges the current settings); and the GET response has no `discordWebhookUrl`. Keep every other test.

- [ ] **Step 2: Run to see it fail.** `npx vitest run "app/api/venues/[venueId]/settings"` Expected: FAIL. Include the failing line.

- [ ] **Step 3: Edit the route.**

Delete `webhookSettingsSchema` (the object with `taskCreated`, `taskCompleted`, `partakeEvent`, `saleLogged`, `dailySalesSummary`, `staffJoined`) and `discordWebhooksSchema`. In `updateSettingsSchema` delete the `webhooks`, `discordWebhooks` and `discordWebhookUrl` entries and the `// Keep for backward compatibility` comment above the last. In the GET handler remove `discordWebhookUrl: true` from the Prisma `select` and `discordWebhookUrl: venue.discordWebhookUrl` from `responseBody`. In the PUT handler remove `discordWebhookUrl` from the destructuring of `validatedData`, delete the `...(discordWebhookUrl !== undefined && { discordWebhookUrl: discordWebhookUrl || null })` spread in `prisma.venue.update`'s `data`, remove `discordWebhookUrl: true` from that update's `select`, and remove `discordWebhookUrl: updatedVenue.discordWebhookUrl` from `putResponseBody`. Update the comment `// Update venue settings and webhook URL` to `// Update venue settings`. Nothing else in the route changes.

- [ ] **Step 4: Edit the page.**

In `app/dashboard/[slug]/settings/page.tsx`: (a) in the `useState<VenueSettings>({ ... })` default object delete `discordWebhookUrl: ""`, the `webhooks: { ... }` object and the `discordWebhooks: { ... }` object; (b) in the `setSettings({ ...settingsData, ... })` that maps the loaded settings, delete the `discordWebhookUrl`, `webhooks` and `discordWebhooks` entries and their three comments; (c) delete the whole `{/* ── Discord Webhooks ── */}` `<section className="panel"> ... </section>` (it ends at the `</section>` just before the next `{/* ── ... ── */}` section comment); (d) in the integrations list change the Discord card's description `OAuth sign-in and event webhooks` to `OAuth sign-in`; (e) change the comment `// Save settings JSON (tagline, tags, hours, permissions, webhooks etc.)` to `// Save settings JSON (tagline, tags, hours, permissions etc.)`. Remove any import this leaves unused (the compiler and eslint will say which).

- [ ] **Step 5: Run, typecheck, lint.** `npx vitest run "app/api/venues/[venueId]/settings"`, `npx tsc --noEmit`, `npx eslint "app/api/venues/[venueId]/settings" "app/dashboard/[slug]/settings/page.tsx"` Expected: pass, no output. **Note:** until Task 4 removes the fields from `VenueSettings`, `tsc` must still pass because the type fields are still there; if `tsc` complains that the page's `settings` state is missing required `webhooks` or `discordWebhooks`, do Task 4's type change in this same commit instead and say so.

- [ ] **Step 6: Prove it.** `grep -n -i "webhook" "app/api/venues/[venueId]/settings/route.ts" "app/dashboard/[slug]/settings/page.tsx"` Expected: no output.

- [ ] **Step 7: Commit.** Subject: "Remove the Discord webhook settings". Body: the section, its state and the route fields are gone, and unknown keys in a PUT are stripped by zod; the stored URLs and toggles stay in the settings JSON untouched, unread.

---

### Task 4: Types, migration report and the webhook helper

**Files:**
- Modify: `packages/types/src/venue-settings.ts`, and `packages/types/src/models.ts` only if `discordWebhookUrl` on the venue model is unused after this
- Modify: `lib/migration/venues.ts`, `lib/migration/venues.test.ts`
- Modify: `lib/discord-webhook.ts`, `lib/discord-webhook.test.ts`
- Modify: `app/dashboard/[slug]/tasks/page.tsx` (one comment)

- [ ] **Step 1: Contract for the types and the migration report (inspect, then change).**

`packages/types/src/venue-settings.ts` declares `discordWebhooks: DiscordWebhooks`, `webhooks: WebhookSettings` and `discordWebhookUrl?: string | null` on `VenueSettings`, with defaults near lines 176 to 185, and probably the `DiscordWebhooks` and `WebhookSettings` types. Remove the three fields, their default values and the two types if nothing else uses them. `lib/migration/venues.ts` (lines around 244 to 246) reads `v.settings.webhooks` and `v.settings.discordWebhooks` to count venues that still have webhook flags or URLs in the stored JSON for the migration report. That count must keep working, because the stored values are intentionally left in Prisma: have the migration read them from the raw stored settings with a local, narrow type instead of from `VenueSettings`. Update `lib/migration/venues.test.ts` so its fixtures and expectations still pass and the counts are still covered. Acceptance: `grep -rn "webhooks\|discordWebhooks\|WebhookSettings\|DiscordWebhooks" packages/types/src apps/web/lib/types` prints nothing, `parseVenueSettings` still tolerates stored JSON that contains those keys (add one test that proves an input with them parses without error), and the migration report's webhook counts are unchanged for the same input.

- [ ] **Step 2: Write or adjust the tests first and run them to see them fail** where the types now lack the fields: `npx vitest run lib/migration lib/types` (adjust to the test files that exist) and `npx tsc --noEmit`. Include what failed.

- [ ] **Step 3: Make the change** per Step 1.

- [ ] **Step 4: Prune `lib/discord-webhook.ts`.**

Delete `WebhookType`, `WEBHOOK_TYPE_TO_GROUP` (and its group type), `VenueWebhookConfig`, `getWebhookUrlForType`, `formatTaskCreatedEmbed`, `formatTaskCompletedEmbed`, `formatSaleLoggedEmbed` and `formatStaffJoinedEmbed`. Keep `sanitizeForDiscord`, `isValidDiscordWebhookUrl`, `DiscordEmbed`, `DiscordWebhookPayload`, `sendDiscordWebhook`, `formatFeedbackSubmittedEmbed`, `extractPartakeImages` and `extractPartakeTextBody`. Keep `DiscordColors` only if the feedback embed or something else still uses it; delete it if it is now unused. Prune `lib/discord-webhook.test.ts` to match: remove tests for the deleted functions, keep the rest. In `app/dashboard/[slug]/tasks/page.tsx` line 82, the comment says the priority colours match "the Discord task-notification embed colors (lib/discord-webhook.ts)"; that embed is gone, so delete that comment line only if the colours it explains are still self-explanatory, otherwise reword it to state only what is still true.

- [ ] **Step 5: Whole-repo proof.**

Run from the repo root: `git grep -n -E "getWebhookUrlForType|VenueWebhookConfig|WebhookType|formatTaskCreatedEmbed|formatTaskCompletedEmbed|formatSaleLoggedEmbed|formatStaffJoinedEmbed|discordWebhooks|taskCreated|saleLogged|dailySalesSummary" -- apps packages ':!docs' ':!apps/web/prisma'`
Expected: no output, except hits inside string literals of the migration test fixtures that are deliberately stored-JSON samples (list any you keep and why).

- [ ] **Step 6: Typecheck, lint, full run.** `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run` (the suite was 162 files and about 1427 tests before this plan; report the actual counts).

- [ ] **Step 7: Commit.** Subject: "Drop the webhook fields from the venue settings types". Body: nothing writes or reads them any more; the migration report still counts the values left in the stored JSON, and `lib/discord-webhook.ts` keeps only the feedback alert and the Partake text helpers.

---

### Task 5: Live check

Needs the person's Discord sign-in in Chrome, so it waits until they are at their PC. Stack recipe is the same as the earlier live checks (containers, a local xvm-api at `origin/dev` seeded with the person's Discord id, the dashboard on this branch with a copied `.env.local` pointed at `http://127.0.0.1:8000`, clear `xvm_api_credentials` and flush Redis first).

- [ ] **Step 1: Tasks.** Create a task on the venue's Tasks page, start it, complete it. Expected: each succeeds and the list updates (the sends were fire-and-forget, so nothing visible should change, and the server log shows no webhook error).
- [ ] **Step 2: A sale.** Log a sale from the dashboard. Expected: it saves and the live view updates.
- [ ] **Step 3: Settings.** Open the venue's Settings. Expected: no "Discord Webhooks" section, the Discord integration card reads "OAuth sign-in", and saving a change (for example the tagline) succeeds. Check in the local Postgres that a venue whose settings JSON already holds `discordWebhooks` still holds it after the save (`select settings from venues`).
- [ ] **Step 4: Invite accept is not live-checked** (it needs a second person); say so in the PR.
- [ ] **Step 5: Tear down** (kill servers by port, `docker stop` both containers, remove the copied `.env.local` and the API worktree).

---

### Task 6: Review, push, PR

- [ ] **Step 1:** One independent review of the whole diff against `origin/dev` (correctness of each removal, nothing left that reads or writes a removed field, the invite-accept degradation, the migration report still counting), with fixes as new commits.
- [ ] **Step 2:** Push and open the PR with `--base dev`, Allegro as reviewer. The body states the **promotion gate** (copy the section above), what is deliberately unchanged (stored values, landing and guide copy, the feedback alert), and what was and was not checked.
- [ ] **Step 3:** Draft a comment for xvm-bot#12 saying the dashboard webhooks are gone from `dev`, the API side (log routes, event keys, settings) is ready, and delivery is the open piece. Show it to the user and post nothing without a go-ahead.
