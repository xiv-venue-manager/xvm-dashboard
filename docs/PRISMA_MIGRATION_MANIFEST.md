# Prisma to xvm-api migration manifest

> Living document. One place that lists everything in Prisma that has to move to xvm-api in the maintenance window. Update the row when a cutover merges or a decision is made.
>
> Code scanned 2026-10-08 against `dev` at `e0c00438`. The scan is regex-based and counts code references only. The same day prod was also read, SELECT-only, at the owner's request, to get row counts and to check each domain's data against xvm-api's constraints. The results are in "Prod audit (2026-10-08)". Field-level parity is checked for every domain except venues, which is parked. See "What this does not tell you".

## The plan this serves

1. Build everything on `dev` with no Prisma dependency.
2. When `dev` is fully cut over, take prod down for one maintenance window.
3. Capture everything needed, and migrate all Prisma data to xvm-api in that window.
4. No impact to our users or to Frogge's users.

Working rules, from earlier decisions:

- Prod is read-only while preparing: SELECT inside a read-only transaction, and only when the owner asks. The one write so far (2026-10-08, at the owner's request) closed three stuck clock-ins, with a backup first. Rehearsals run on a copy in an isolated local database.
- Scripts are idempotent, dry-run by default, and report what they refuse instead of dropping it. A re-run must not duplicate.
- No Prisma in new code. A script reads a plain SQL export (JSON from `psql`), never the Prisma client. `apps/web/scripts/export-shouts.sql` and `apps/web/scripts/backfill-shouts-to-xvm-api.ts` (PR #134) are the pattern for the read side.
- Data that has to keep its original dates is loaded **straight into xvm-api's Postgres**, not through the API (decision 3, option 3). The API stamps "now" on most records and has no field to say otherwise. Shouts are the exception and stay API-based, because their dates do not matter.
- The migration has to finish before the app starts reading xvm-api, never after. Once users can re-save things, the old copy collides with the new one (xvm-api enforces one label per person on shouts, for example).

## How to read the inventory

Status of each Prisma table on `dev`:

| Status | Meaning |
|---|---|
| **Cut over** | Nothing on `dev` reads or writes it. The code uses xvm-api. The old data is still in Prisma and has to be moved. |
| **Live** | `dev` code still reads or writes it. It needs a cutover first, then a move. |
| **Dead** | No code touches it. Decide: move, archive or drop. |
| **Bot** | Read by `apps/eorzea-bot` through raw SQL, so a model-name grep does not show it. |

"Dev code" is the number of references found: `r` reads, `w` writes, `raw` raw-SQL mentions. `web` is `apps/web`, `bot` is `apps/eorzea-bot`, `dbot` is `apps/discord-bot`.

"xvm-api target" names a model that exists in xvm-api `dev` (94 models). **Existing is not the same as mapped:** nobody has compared the fields.

## Inventory

### Identity

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `users` | r web 9, w web 2, raw web 1, bot 4, dbot 1 | Live | `Person` | A `Person` is created at first sign-in by the token exchange, keyed by Discord id, so people who sign in again need no copy. `Person` is thin (`display_name`), so the other fields map as decided on 2026-10-08, see decision 2. |
| `accounts` | r web 2, w web 1 | Live | `PersonAccount` | Owned by next-auth's `PrismaAdapter` (`lib/auth.ts`). Stays until auth leaves the adapter, which is the long pole in the decommission notes. Holds Discord OAuth tokens, which are not worth migrating. |
| `sessions`, `verification_tokens` | none | Dead | none | Sessions are JWT. Confirm empty or irrelevant, then drop. |
| `xvm_api_credentials` | r web 3, w web 3 | Live | none | A cache of the person's xvm-api token. Nothing to migrate. Goes away when the cache moves into the JWT. |

### Venues

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `venues` | r web 131, w web 7, raw web 1, bot 3, dbot 1 | Live | `Venue`, `VenueProfileSettings`, `VenueDiscordSettings`, `VenueImage`, `VenueExternalLink` | Most reads are the `xvmApiVenueId` bridge. **No prod venue is on xvm-api** (prod's `venues` table does not even have the `xvmApiVenueId` column), so the window creates all of them, 67 of the 69 (decision 7). Existing scripts: `backfill-venue-profile.js`, `backfill-gallery-images.js`. Carries `froggeToken` (see Frogge). `discordWebhookUrl` is deprecated but still read and written. A field-by-field map is not written. |
| `venue_schedules`, `venue_schedule_entries` | none | Dead | `VenueHours` | Retired from the app per code comments (`venues/[slug]/page.tsx`, `api/public/venues/route.ts`). Issue #57 still describes a Prisma write; its text predates this and should be rechecked. Hours live in xvm-api. |
| `venue_follows` | r web 4, w web 2 | Live | `VenueFollow` | Blocked on xvm-api#151. Toggles were decided DROP. |
| `venue_inventory_settings` | r web 2, w web 1 | Live | no obvious target (`ServiceInventory` is per service) | Target unclear. **Decision or xvm-api question.** Has a plugin counterpart that stays Prisma until the plugin cutover. |

#### `venues` column parity (checked 2026-10-08 against xvm-api `dev`)

Prisma's `Venue` columns against xvm-api's venue models (`VenueModel`, `VenueExternalLink`, `VenueImage`, `VenueHours`, `VenuePayrollSettings`, `VenueDiscordSettings`). **xvm-bot is not a home for the gaps:** it has no database of its own (its dependencies are `httpx`, `py-cord`, `pydantic-settings`, `loguru`, `tzdata`, and it keeps no local files), so everything it uses is read from xvm-api over HTTP. Anything without an xvm-api home needs one, or has to be dropped.

| Prisma column | xvm-api home | Status |
|---|---|---|
| `name`, `slug`, `description`, `logoUrl`, `bannerUrl`, `dataCenter`, `world`, `district`, `ward`, `plot`, `apartment`, `timezone`, `currencyName`, `venueType`, `isActive` | same-named `VenueModel` columns | Covered |
| `galleryImages` | `VenueImage` | Covered (script exists) |
| `ffxivVenueId`, `ffxivVenueLinkedAt`, `ffxivVenueLinkedBy` | `VenueExternalLink` (provider ffxivvenues) | Covered |
| `discordServerId` | `VenueExternalLink` (provider `DiscordGuild`), written by #131 | Covered |
| `ownerId` | owner `Membership` | Covered once memberships move |
| `venueSchedule` | `VenueHours` | Covered |
| `venuePotSettings` | `VenuePayrollSettings` | Covered, field mapping not compared |
| `xvmApiVenueId`, `xvmApiVenueLinkedAt`, `xvmApiVenueLinkedBy` | none needed | The bridge, goes away |
| `partakeTeamId` | none | **Gap** |
| `froggeVenueId`, `froggeToken`, `froggeConnectedAt`, `froggeConnectedBy` | none found | **Gap.** `froggeToken` is a secret and `VenueExternalLink` has no secret column. |
| `settings` (JSON) | partly | **Gap, key by key.** It holds at least shift-bot settings (days before event, thumbnail, templates), webhook routing, and visibility keys that map to `VenueModel`. Nobody has listed every key. |
| `venueInventorySettings` | unclear (`ServiceInventory` is per service) | **Gap** |
| `discordWebhookUrl` | `VenueLogRoute` | Retiring (webhooks decision 2026-09-09) |

xvm-api also has venue fields Prisma lacks (`room`, `subdivision`, and the task, sales, revenue and event visibility settings), so the move is not purely one way.

### People at venues

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `memberships` | r web 55, w web 1, raw bot 3, dbot 1 | Live | `Membership`, `EmploymentPeriod` | Decision 2026-08-30: backfill existing people, native invite flow for new. Needs persons, venues and positions first. Today only venue creation writes it, which is why the dashboard refuses invitees (PR #136 fixes the read side). Frogge staff are a separate source, see Frogge. |
| `roles` | r web 1 | Live | `Position` | `migrate-positions.ts` exists. Hourly rates convert gil to minor units. |
| `membership_role_assignments` | none | Cut over | `MembershipPosition` | Not confirmed that `migrate-positions.ts` carries assignments. **Check.** |

### Events

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `events` | r web 11, w web 9, raw web 1 | Live | `Event`, `RecurrenceRule` | Five crons, `lib/partake.ts` and `lib/venue-status.ts` still read it; Partake sync still writes it (#57). The recurrence models differ (Prisma pre-generates occurrences, xvm-api materialises them), so this needs its own mapping. |
| `event_templates` | none | Cut over | `EventTemplate` | Move needed. |

### Patrons

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `patrons` | raw web 2 | Live | `Patron` | Reached by raw SQL, not the Prisma client. |
| `patron_logs` | raw bot 2 | Bot | `PatronLog` | Frozen: the plugin writes to xvm-api since #95. The bot's loyalty roles and `/myprofile` still read the frozen table (#125). Decide how much history moves. |

### Money

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `services` | r web 2, w web 2 | Live | `Service`, `ServiceCategory`, `ServiceInventory` | Only plugin inventory routes remain. `migrate-services-to-xvm-api.ts` exists and writes the new id back to Prisma. |
| `transactions` | r web 1 | Live | `Transaction` | The daily-sales-summary cron still reads it, so that summary posts wrong numbers. The plugin writes sales to Prisma until xvm-api#50, so Prisma and xvm-api both hold live sales. Decide how much history moves. |
| `payroll_entries`, `pot_distributions`, `venue_pot_settings` | none | Cut over | `PayrollEntry`, `PotDistribution`, `VenuePayrollSettings` | Move needed. Whether pot settings map to `VenuePayrollSettings` is not confirmed. |

### Shifts and tasks

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `shifts` | r web 24, w web 15, raw web 1, bot 3 | Live | `Shift` | The shift pipeline is split: Discord, plugin and cron paths are still Prisma while the dashboard is on xvm-api. Waiting on Allegro (no bulk cancel, no recurrence match). |
| `shift_audit_logs` | w web 1 | Live | `ShiftAuditEntry` | Tied to the shift pipeline. |
| `shift_signup_embeds` | r web 6, w web 6 | Live | unclear (`CustomEmbed`, `DiscordPost`?) | Used by `lib/shift-bot.ts`. Target unclear. |
| `tasks` | none | Cut over | `Task`, `TaskCategory` | Move needed. Needs memberships first. |

### Notifications

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `notifications` | r web 2, w web 2 | Live | `Notification` | Blocked on the xvm-api emitters and xvm-api#151. |
| `pending_notifications` | r web 4, w web 5 | Live | unclear (`BotRequest`?) | Used by the bot clock-in route, the dispatch cron and plugin shift routes. |
| `webhooks` | none | Dead | `VenueLogRoute` | Webhooks are being retired (decision 2026-09-09). Routing settings that live in `Venue.settings` need a home. |

### Person-scoped

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `shout_templates` | none | Cut over | `ShoutTemplate` | Script and pattern: PR #134 (parked). Needs the Discord id to person mapping. |
| `user_characters` | r web 1, w web 1, raw web 1, bot 2 | Live | `PersonCharacter` | **Split by writer:** dashboard links go to xvm-api, plugin links still go to Prisma. Both halves have to be merged. |
| `feedback` | none | Cut over | `Feedback`, `FeedbackBlock`, `FeedbackDraft`, `FeedbackImage` | Move needed, or drop old reports. **Decision.** |
| `announcements`, `announcement_dismissals` | none | Cut over | `Announcement`, `AnnouncementDismissal` | Dismissals have to be mapped from Prisma users to persons. Ids change from cuids to integers. |
| `api_keys` | r web 5, w web 5 | Live | `Credential`? | Plugin keys. The plugin cutover is deferred, so these stay until then. **If the plugin switches in the window, keys must too, or the plugin stops working.** |

### Bot-owned (`apps/eorzea-bot`, raw SQL)

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `discord_members` | raw bot 8 | Bot | `LevelingMember`? | XP and levels. |
| `discord_warn_logs` | raw bot 2 | Bot | `ActivityLog`? | |
| `discord_guild_config`, `discord_gil_reaction_rewards`, `discord_open_venues`, `discord_tracked_messages` | none | Dead | unclear | The old bot may read them without Prisma. Dropped with the bot unless xvm-bot needs the data (see the note below). |

**Decided 2026-10-08: all the old bots (`apps/eorzea-bot`, `apps/discord-bot`) are removed and replaced by xvm-bot.** So their tables are not migrated by default, and their code and Prisma usage go away with them. The only question is which of their data has to carry over into xvm-api (XP and levels, warns, venue-open state), which is decision 5.

`apps/eorzea-bot` also has **its own** `prisma/schema.prisma` (it declares, for example, a model keyed by `venueId`). That is a second Prisma consumer, removed with the bot. This scan only enumerated the web app's schema, so the bot's own models are not in the table above.

## Frogge

Known:

- Frogge staff data comes from the hosted FroggeAPI (`GET /staff-members`): `discord_user_id`, `name`, `employment_periods[]`, `qualifications[]`. Auth already works per venue through `Venue.froggeToken`.
- Gaps found 2026-08-31 and not resolved: Frogge has **no tier concept**, and xvm-api **cannot backdate** employment periods (`accept`, `terminate`, `rehire` all stamp now).
- Dashboard routes `frogge/disconnect`, `frogge/members` and `frogge/redeem` read Prisma and are gated on a Prisma membership (fixed on the read side by PR #136).
- `docs/FROGGE_INTEGRATION_STATUS.md` describes the integration as of 2026-08-21.

Not known:

- How many prod venues have `froggeToken` set: **3** (counted 2026-10-08).
- What "no impact to Frogge's users" has to mean in practice (their staff rosters, their roles, their connected venues, their data).
- Which `discord_*` tables hold Frogge-origin data, if any.

## Removing the venue bridge

The dashboard's Prisma `Venue` row maps the dashboard's own venue id and slug to the xvm-api venue (`xvmApiVenueId`). Prisma and xvm-api's SQLAlchemy/Alembic cannot both own a schema, so every Prisma dependency, this bridge included, has to go. **The bridge is removed in code on `dev`, before the maintenance window.** The window then moves data into a dashboard that no longer needs it, and never has to recreate the bridge.

What the bridge is today (`dev` at `e0c00438`, scanned 2026-10-08):

| Measure | Count |
|---|---|
| Prisma venue lookups in the web app | 136 |
| of which read only the bridge (xvm-api id, id, slug) | 78, in 77 files |
| of which read the bridge plus other columns | 31, in 29 files |
| of which read the whole row or an include | 27, in 24 files |
| Route files keyed by the Prisma venue id (`app/api/venues/[venueId]/`) | 84 |
| Page files keyed by slug (`app/dashboard|venues/[slug]/`) | 27 |
| Plugin route files that mention `venueId` | 23 |
| Prisma columns named `venueId` (foreign keys, gone with their tables) | 65 |

### The path

1. **Venue creation on xvm-api (plan: #138).** After it no venue is born without an xvm-api id. The migration window creates every existing venue in xvm-api (none are there today).
2. **Give the leftover `Venue` columns a home, or drop them** (`partakeTeamId`, the Frogge columns, parts of `settings`, inventory settings; see the column table above). **Move the four profile readers off Prisma** (landing card, discover, following, the event-status cron). After this, every one of the 136 lookups needs only the id mapping.
3. **Re-key everything on the xvm-api venue id (`ven_...`), in one stack.**
   - The 84 routes take the xvm-api id as `[venueId]`. Each file's `requireXvmVenueId` lookup is deleted, not replaced.
   - Authenticated pages resolve a slug to a venue through `GET /me/venues`, which already carries `slug`. No Prisma, one call per render.
   - Public pages (`/venues/[slug]`, discover) need a public lookup by slug in xvm-api.
   - Cache keys switch to the xvm-api id.
   - This has to land at once. A route's `[venueId]` cannot mean two things, and an "accept either id" mode is a transitional state we do not want.
4. **Plugin and old bots.** The plugin's API keys currently store a Prisma `venueId`. They become xvm-api credentials narrowed to a venue (xvm-api credentials already carry a `venue_id` narrowing), so the plugin's Prisma venue id goes away with the plugin cutover. The old bots (`apps/eorzea-bot`, `apps/discord-bot`) join the `venues` table in raw SQL. They are removed and replaced by xvm-bot (decided 2026-10-08), which has no database, so nothing about them has to be re-keyed.
5. **Delete.** When no code reads `prisma.venue`, remove the `Venue` model. The 65 `venueId` columns go with their tables in the migration.

### Asks for xvm-api (Allegro)

- A **public venue lookup by slug**. A search of `routers/venues.py` and `routers/public.py` found lookups by id (`GET /venues/{venue_id}`, `/public/venues/{venue_id}`), by external link, and the caller's own list, but none by slug. Please confirm.
- A **home for each leftover venue column** (see the column table), or a decision to drop it.

### Removing the bridge is not removing Prisma

Two more layers are on it, and nothing else can be Prisma-free while they stay:

- **Identity.** The NextAuth `PrismaAdapter` owns `User` and `Account`. This is the long pole and nothing is built for it.
- **The credential cache.** `XvmApiCredential` can move into the JWT. It is self-contained and independent of the bridge.

Only when all three are gone can the Prisma client, `prisma generate`, `schema.prisma` and `lib/prisma.ts` be deleted.

### A guard while it shrinks

Once step 2 is done, a lint rule like the one planned for `prisma.membership` (#136, Task 8) can ban `prisma.venue` outside an allowlist. The allowlist shrinks as step 3 lands, so nothing new can depend on the bridge.

## Prod audit (2026-10-08)

### What was done

Prod's Postgres (`venue_manager`) was read with SELECT queries inside read-only transactions, at the owner's request. Each domain's Prisma shape was compared with xvm-api `dev`'s model, and the prod data was checked against the constraints xvm-api enforces (lengths, uniqueness, ranges, required references). Findings below are a snapshot of that day.

Prod's schema is **older than `dev`'s**. For example, `venues` has no `xvmApiVenueId`, `services` has no `xvmApiServiceId`, and `venues` still has a legacy free-text `location`. The export scripts must not assume `dev`'s columns.

### Row counts (non-empty tables)

| Table | Rows | Table | Rows |
|---|---|---|---|
| `patron_logs` | 9695 | `venues` | 69 |
| `pending_notifications` | 2212 | `discord_members` | 68 |
| `shifts` | 1026 | `refresh_tokens` | 59 |
| `shift_audit_logs` | 887 | `feedback` | 44 |
| `patrons` | 760 | `venue_schedule_entries` | 28 |
| `events` | 534 | `tasks` | 27 |
| `_RoleToService` | 395 | `rooms` | 22 |
| `payroll_entries` | 303 | `shift_signup_embeds` | 20 |
| `notifications` | 289 | `venue_pot_settings`, `venue_inventory_settings`, `announcement_dismissals` | 18 each |
| `users` | 254 | `discord_tracked_messages` | 9 |
| `accounts` | 252 | `discord_open_venues` | 8 |
| `memberships` | 248 | `venue_schedules` | 5 |
| `roles` | 228 | `shout_templates` | 4 |
| `services` | 166 | `sessions`, `notification_preferences`, `event_templates`, `discord_warn_logs`, `discord_gil_reaction_rewards`, `announcements` | 1 each |
| `api_keys` | 146 | | |
| `user_characters` | 137 | | |
| `transactions` | 114 | | |
| `venue_follows` | 89 | | |
| `membership_role_assignments` | 78 | | |

About 16,000 rows in all. A load takes seconds, and a rehearsal on a prod copy is cheap. The window is mostly verification.

### Decisions

| # | Topic | Status | Answer |
|---|---|---|---|
| 1 | Existing scripts | Decided | Convert them to the export-based pattern (no Prisma client). They lose "write the id back to Prisma" as their idempotency mechanism, so each needs another way to stay re-runnable (a mapping file kept outside Prisma). |
| 2 | What survives from `users` | Decided | `discordId` becomes a `person_accounts` row (provider `discord`); `displayName` becomes `Person.display_name`; `email` becomes a `person_accounts` row (provider `email`, `external_id` the address; Allegro to confirm that using it as a contact address is intended, since the model describes it as a login); `image` is dropped (refreshed from Discord at sign-in). Users are emailed when a venue is set up, and owners can be emailed through xiv-admin. That mail flow is reworked after `dev` reaches `main`. |
| 3 | History depth and dates | Decided | All history, with original dates wherever they feed a venue's analytics (transactions, payroll, shifts, patron logs, events, tasks). Shout dates do not matter. Because the API cannot backdate, the load writes straight into xvm-api's Postgres (option 3). |
| 4 | Frogge | Allegro | Their question. What "no impact" means, tier assignment, and the 3 connected venues. See "Waiting on Allegro". |
| 5 | Old-bot data | Allegro | Allegro manages xvm-bot and decides what carries over. |
| 6 | Plugin | Decided | The plugin switches to xvm-api in the window. Every plugin user relinks with a pairing code; old keys are not carried. No grace period for old routes is assumed (they would return an update-and-relink message). |
| 7 | Prod venues | Decided | No prod venue is on xvm-api. All are created in the window except the 2 ownerless empty ones (`zino`, `Chaoslord171`). 67 of 69 migrate, including 41 with no events or transactions. |
| 8 | Timestamps | Decided | Analytics dates are kept (decision 3). Shouts and other non-analytics data may take the copy time. |
| 9 | Feedback and announcements | Decided | Drop old announcements. Keep feedback: the 17 open items stay live, the real completed ones are archived, about 10 test or message items are dropped. |
| 10 | Field parity | Done except venues | See the per-domain notes. Venues are parked. |

### Per-domain notes

Each entry gives what loads, how the fields map, and what is fixed or dropped on the way. "Minor unit" is 1 gil.

**Persons.** Every user who has a membership, character, payroll entry or other reference gets a `Person` with a `discord` account row. Two special cases: 29 distinct manual payroll payees (below) and one user with no Discord identity (below) get a `Person` with no Discord account.

**Venues (parked).** 69 in prod, 67 migrate. Name, slug, description, logo, banner, address, data centre, world, active flag and the four visibility settings map to `VenueModel`. 320 gallery images over 42 venues (all plain URLs) become `VenueImage`. `partakeTeamId` (7 venues) and `ffxivVenueId` (5) become `VenueExternalLink` rows (providers `Partake` and `FFXIVVenues`). The legacy `location` column restates district, ward and plot and is dropped. All 69 venues have timezone `UTC` while their events carry real zones (Edmonton 205, UTC 168, Los Angeles 38, New York 27, Berlin 23, Riyadh 20); proposed rule: venue timezone is its most common event timezone, else UTC. `venueType` has 10 values plus 22 null (4 are `TEST_VENUE`; skip or migrate is open). `settings` JSON keys with **no xvm-api home**: `tagline` (11 venues), `tags` (17), `isAdult` (21), `openNights` (22), `defaultHours` (20), `shiftBot` (21), `notifications` (9). `discoverySources` (one venue has data) is dropped. The webhook flags (26) and `discordWebhooks` (19) are retiring.

**Positions and memberships.** `roles` (228) become positions: hex colour to integer, `potPayoutMode` to `standard`/`pot`/`contractor`, hourly rate to minor units (47 have one). No role has any permissions, so no capabilities are needed. 60 roles are unused defaults and still load. `memberships`: 216 active (76 owners, 23 managers, 117 staff) become memberships with one open employment period starting at `hireDate`. The 32 pending invites (11 manager, 21 staff) have no user, have all expired, and are dropped. One membership hourly rate (500 gil, the owner's own test account at Velvet Rift) has no home and is dropped. Custom role and additional role assignments become `membership_positions`. No inactive members, no temporary roles, no duplicates.

**Services.** 166 over 18 venues, 395 role grants (every service has some). Price to minor units, the 26 free-text categories become `service_categories`, grants become `service_positions` through the role to position map, 38 linked items become `service_inventories`. The one stock count without a linked item ("1h Bar Buyout" at Ash & Amaranth, count 3) is dropped because xvm-api inventory requires an FFXIV item. No duplicate names, no negative or fractional prices.

**Events.** 534 over 27 venues (2022 to 2027). xvm-api has no stored status: draft is `published_at` null, published, active and completed set `published_at`, cancelled sets `cancelled_at` (the 21 cancelled events have no date, so their `updatedAt` is used). The 167 Partake links, reminder times and creators map directly. Recurrence: 16 parents (14 weekly, 1 biweekly, 1 monthly) with 308 children become `recurrence_rules` plus occurrence slots (`scheduled_at`); the monthly one needs a by-date or by-weekday call. Fixes: one event with end equal to start gets +3 hours; two titles over 200 characters (218 and 210) are cut to 200 with the full title put at the top of the description; the single event template is junk and dropped. `attendanceCount` (67 events) and `revenue` (35) have no home; 65 and 34 of them can be derived from patron logs and transactions. For the remainder, 2 events get one synthetic headcount log and 1 event (42,400 gil) gets one `other_income` transaction, each noted as migrated. The stored attendance was lower than xvm-api's derived figure on 63 of 65 events, so the derived figure is the one shown from now on. `partakeAttendeeCount` is dropped (the next sync refills it). The Discord post tracking on 7 events is a question for Allegro.

**Shifts.** 1026 over 21 venues, 887 audit entries. Zero hard-constraint violations. xvm-api derives status from timestamps: scheduled sets `claimed_at` and `approved_at`, the 7 claimed shifts set `claimed_at` only, cancelled sets `cancelled_at` from `updatedAt` (the real time was never stored). Claim and approval times come from the audit log where it has them (134 and 251 of 431 assigned shifts), else the creation date. Role to position, reminder time kept, hours worked dropped (derived), the 13 signup-embed links dropped (bot-owned), payroll links kept. Recurrence: 94 parents (55 weekly, 39 biweekly), 406 children, 62 slot groups become recurrence rules with `slot_index`. Audit actions go to lower case; `CANCEL_SERIES` becomes `cancel` with a note; `web`/`admin` sources become `dashboard`, `plugin` stays, `discord` becomes `bot`, `xiv-admin` becomes `system`, and the 11 manual edits keep their original source in the note. **Rule:** any shift still clocked in at load time is ended at its own scheduled end, with a `clock_out` entry. (Three stale clock-ins were already closed in prod on 2026-10-08; see below.) A shift open at the window with no scheduled end, or one whose scheduled end is still in the future, needs a manual call.

**Transactions.** 114 over 11 venues, 110 sales and 4 tips, all positive whole gil. `created_at` and `posted_at` both take the original date, status `posted`, the staff member becomes `membership_id` and `recorded_by_person_id`, the service name is copied in. No xvm-api change.

**Payroll.** 303 entries over 7 venues. Gil to minor units (31 rows had fractions); hours to whole minutes, rounded (152 rows), with the stored total kept unchanged. Two things need handling: 35 manual entries (33 fixed, 2 hourly) have a typed name and no membership, while xvm-api requires a person, so each of the 29 distinct names becomes a placeholder `Person` (no account, no membership) and typos are merged afterwards with xvm-api's person-merge service; and 86 entries have a period that starts and ends at the same instant, which xvm-api rejects, so `period_end` is set to `period_start` plus one day. The 2 paid hourly entries with a total of 0 are dropped, so 301 of 303 load. No pot distributions exist.

**Patron logs and patrons.** 9695 logs over 14 venues and 760 patrons over 8. `ENTER` becomes `enter`, `LEAVE` and `EXIT` become `leave`. 921 logs (2026-04-17 to 2026-07-29) have `countChange` 0, which would make xvm-api's entries, exits and peak occupancy read zero for that period; they get +1 or -1. Of those, 11 nameless rows carry nothing and are dropped, so 9684 load. Six patrons were unbanned but still have a ban date, and xvm-api treats any ban date as banned, so `banned_at`, the reason and the banning person are cleared on unbanned patrons. One patron is actually banned.

**Characters.** 137 over 118 users map to `person_characters` with the same name and world, `self_declared`. No case-insensitive duplicates. The one user with characters and no primary gets their oldest as primary.

**Follows and notifications.** 88 of 89 follows load (one follows a skipped venue). The 289 old in-app notifications, the single notification-preferences row and all 2212 pending notifications are dropped. **The pending queue must never be loaded:** all 2212 are unsent and 2189 are past due, and xvm-api's dispatcher would send every one of them on its first run.

**Pot, inventory, tasks, rooms.** `venue_pot_settings` (18, three enabled) map to `venue_payroll_settings` (tax percent times 100 gives basis points); the `enabled` flag has no column and is a question for Allegro. `venue_inventory_settings` (18, five enabled) map to the `inventory` module toggle. Tasks (27 over 10 venues, all assigned to a role or to nobody) map to `tasks` with priorities 0 to 3, `assignedRoleId` to `assigned_position_id`, and `updatedAt` as the start date of the four in-progress ones. Rooms (22 over 6 venues) map directly; none is occupied, locked, owned, linked to Frogge or has an image. `shout_templates` (4) are covered by PR #134.

**API keys (146).** 111 are active and 85 distinct people used a key in the last 30 days. Keys are stored as hashes and cannot be carried over, so everyone relinks. That needs an announcement beforehand and a pairing-code screen or xvm-bot command (the route needs a person credential, and nothing has been checked yet on the dashboard side). One active key belongs to the user with no Discord identity (below). `refresh_tokens` (59) and `sessions` (1) are dropped.

**Schedules.** 28 entries over 15 venues are the only structured hours for three venues (After Effect, Cream Nightclub, The Black Dahlia). The five venues that sync from ffxivvenues.com repopulate through xvm-api's `ffxivvenues` hours source, so their 5 raw synced payloads are dropped and the 8 entries that belong to them are not carried. About 20 manual entries are loaded as `venue_hours` with recurrence rules (default, not yet confirmed by the owner).

**The user with no Discord identity.** One staff member (at The Final Act) does not sign in to the dashboard and does not want Discord; their user row and plugin key were made by hand. They cannot use the normal relink, because pairing codes are created by a signed-in person or by the bot acting for a Discord user. Plan: the load creates their `Person` from the manual row, and an operator issues one pairing code for them. Allegro to confirm, and to say whether a no-Discord path should exist at all.

### Changes already made to prod

| Date | Change | Backup |
|---|---|---|
| 2026-10-08 | Three clock-ins that had stayed open (two at The Final Act for 5 and 19 days, one at G-Bathhouse for 20 hours) were ended at their scheduled ends: status completed, hours set, three `CLOCK_OUT` audit rows (source `manual`, same as earlier manual closes). | `~/db-backups/shifts-before-close-20261008-2120.sql` on the server (data only; restoring needs `--disable-triggers` because `shifts` references itself) |

### Proposed order inside the window

Draft, not rehearsed. Everything loads straight into xvm-api's Postgres except shouts.

Before: announce the relink, ship a plugin release that talks to xvm-api, dump prod and dump xvm-api's database, rehearse the whole sequence on copies.

1. Take prod down. Export each table to SQL or JSON.
2. Persons and their account rows (including the 29 payee placeholders and the no-Discord user).
3. Venues (67), external links, images, hours and recurrence rules, module toggles.
4. Positions, memberships and employment periods, membership positions.
5. Services, categories, grants, inventory.
6. Events and recurrence rules; the three synthetic attendance and revenue rows.
7. Shifts and their audit entries; tasks; rooms; payroll entries; transactions; patron logs and patrons; characters; follows; feedback.
8. Shouts, through the existing API-based script.
9. Verify: counts per venue and per person, and sums for money, hours and attendance, against the source.
10. Switch the app and the plugin to xvm-api. Every plugin user relinks.

Rollback idea, unreviewed: Prisma is only read during the window, so rolling back means redeploying the old build against it. xvm-api's database needs a dump first so partial writes can be discarded.

### Waiting on Allegro

- A home for the venue settings listed under Venues: tagline, tags, adult flag, open nights, default hours, the shift-bot settings and the notification toggles.
- How the pot `enabled` flag is switched on, and whether the per-venue module toggles are enforced anywhere.
- Whether xvm-api's recurrence generator would duplicate loaded future shifts and events when a rule is enabled.
- Frogge (decision 4) and the old-bot data (decision 5).
- Whether `person_accounts` with provider `email` is meant to hold contact addresses, and whether a no-Discord person path should exist.
- What to do with the Discord post tracking on 7 events (`discordMessageId` and related columns).
- Which xvm-api tables and columns a direct load may rely on.

### Parked

- Venues: the timezone rule, the four `TEST_VENUE` venues, and Allegro's answer on the settings.
- Whether to drop or carry the opening-hours entries (default above is carry).

## Existing scripts

| Script | Covers | Uses Prisma client? |
|---|---|---|
| `apps/web/scripts/migrate-positions.ts` | roles to positions | yes |
| `apps/web/scripts/migrate-services-to-xvm-api.ts` | services, categories, position grants | yes (and writes ids back) |
| `apps/web/backfill-venue-profile.js` | venue profile fields | yes |
| `apps/web/backfill-gallery-images.js` | gallery images to storage | yes |
| `apps/web/scripts/backfill-shouts-to-xvm-api.ts` (PR #134) | shouts | **no**, reads a SQL export |

Decision 1 converts the four older scripts to the export-based pattern. With decision 3, most of them are superseded by the direct load and only keep their mapping logic.

## What this does not tell you

- **Prod after 2026-10-08.** The counts and data checks are a snapshot of that day. Re-run them on the copy used for rehearsal, because prod keeps changing (new shifts, logs, sign-ups).
- **Field parity for venues.** Parked until Allegro answers; see "Parked". Every other domain was compared field by field.
- **Behaviour of the load, not just the shape.** The maps say what lines up; nothing has been loaded into a real xvm-api yet. The rehearsal is where constraints Allegro enforces in code (not in the schema) will show up.
- **Completeness of the scan.** It matches `prisma.<model>`, `tx.<model>`, `db.<model>` and `FROM/JOIN/INTO <table>` in raw SQL. A table reached some other way (a view, a dynamic name, another service sharing the database) is missed. `apps/eorzea-bot` and `apps/discord-bot` are in this repository; anything outside it that shares the database is invisible here.
- **Other readers of the database.** FroggeAPI and any other service with its own connection are not covered.
- **`apps/eorzea-bot`'s own Prisma schema.** Not inventoried; it is removed with the bot (see the bot-owned section).
- **The by-slug lookup claim.** "xvm-api has no lookup by slug" comes from searching two router files, not from reading every router.
- **Whether "Cut over" tables have a working replacement for every use.** The status means no code on `dev` touches the table, not that the replacement was checked end to end.

## Refreshing this document

Re-run a scan from the repository root, then update the "Dev code" and status columns. This is lightly simplified from the one used on 2026-10-08 (that version also matched `UPDATE` in raw SQL); it excludes tests, generated code, the Prisma directory and the one-off scripts.

```python
import re, subprocess, collections
schema = open("apps/web/prisma/schema.prisma").read()
models = {}
for m in re.finditer(r"^model (\w+) \{(.*?)^\}", schema, re.S | re.M):
    t = re.search(r'@@map\("([^"]+)"\)', m.group(2))
    models[m.group(1)] = t.group(1) if t else m.group(1)
files = subprocess.run(["git", "ls-files", "apps", "packages"], capture_output=True, text=True).stdout.split("\n")
src = [f for f in files if re.search(r"\.(ts|tsx|js|mjs)$", f)
       and not re.search(r"\.test\.|/generated/|/node_modules/|/prisma/|apps/web/scripts/|backfill-|clean-pending|apply-indexes", f)]
WRITE = re.compile(r"\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b")
for name, table in models.items():
    camel = name[0].lower() + name[1:]
    reads, writes, raw = (collections.Counter() for _ in range(3))
    for f in src:
        text = open(f).read()
        app = f.split("/")[1] if f.startswith("apps/") else f.split("/")[0]
        for m in re.finditer(r"(?:prisma|tx|db)\.%s\.(\w+)" % camel, text):
            (writes if WRITE.match("." + m.group(1)) else reads)[app] += 1
        if re.search(r'\b(FROM|JOIN|INTO)\s+"?%s"?\b' % re.escape(table), text, re.I):
            raw[app] += 1
    print(name, table, dict(reads), dict(writes), dict(raw))
```
