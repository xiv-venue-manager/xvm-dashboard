# Prisma to xvm-api migration manifest

> Living document. One place that lists everything in Prisma that has to move to xvm-api in the maintenance window. Update the row when a cutover merges or a decision is made.
>
> Scanned 2026-10-08 against `dev` at `e0c00438`. The scan is regex-based and counts code references only. No prod access was used, so **no row counts, no data quality, and no field-level parity have been checked**. See "What this does not tell you".

## The plan this serves

1. Build everything on `dev` with no Prisma dependency.
2. When `dev` is fully cut over, take prod down for one maintenance window.
3. Capture everything needed, and migrate all Prisma data to xvm-api in that window.
4. No impact to our users or to Frogge's users.

Working rules, from earlier decisions:

- Prod is never touched directly while preparing. The user runs the dumps; work happens on a copy in an isolated local database.
- Scripts are idempotent, dry-run by default, and report what they refuse instead of dropping it. A re-run must not duplicate.
- No Prisma in new code. A script reads a plain SQL export (JSON from `psql`) and writes through xvm-api. `apps/web/scripts/export-shouts.sql` and `apps/web/scripts/backfill-shouts-to-xvm-api.ts` (PR #134) are the pattern.
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
| `users` | r web 9, w web 2, raw web 1, bot 4, dbot 1 | Live | `Person` | A `Person` is created at first sign-in by the token exchange, keyed by Discord id, so people who sign in again need no copy. `Person` is thin (`display_name`), so `displayName`, `image`, `email`, `discordId` have no home yet. **Decision needed.** |
| `accounts` | r web 2, w web 1 | Live | `PersonAccount` | Owned by next-auth's `PrismaAdapter` (`lib/auth.ts`). Stays until auth leaves the adapter, which is the long pole in the decommission notes. Holds Discord OAuth tokens, which are not worth migrating. |
| `sessions`, `verification_tokens` | none | Dead | none | Sessions are JWT. Confirm empty or irrelevant, then drop. |
| `xvm_api_credentials` | r web 3, w web 3 | Live | none | A cache of the person's xvm-api token. Nothing to migrate. Goes away when the cache moves into the JWT. |

### Venues

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `venues` | r web 131, w web 7, raw web 1, bot 3, dbot 1 | Live | `Venue`, `VenueProfileSettings`, `VenueDiscordSettings`, `VenueImage`, `VenueExternalLink` | Most reads are the `xvmApiVenueId` bridge. **Not every prod venue is connected to xvm-api** (`xvmApiVenueId` null), so the window has to create the missing ones. Existing scripts: `backfill-venue-profile.js`, `backfill-gallery-images.js`. Carries `froggeToken` (see Frogge). `discordWebhookUrl` is deprecated but still read and written. A field-by-field map is not written. |
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

- How many prod venues have `froggeToken` set.
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

1. **Venue creation on xvm-api (plan: #138).** After it no venue is born without an xvm-api id. The migration window creates the missing xvm-api venues for existing ones.
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

## Proposed order inside the window (draft, for editing)

Derived from what depends on what; none of it has been rehearsed.

1. Persons, through the token exchange (Discord id to person).
2. Venues, including creating the missing xvm-api venues and setting `xvmApiVenueId`; profile, gallery, hours.
3. Positions.
4. Memberships (needs 1 to 3), then Frogge staff.
5. Services and categories.
6. Events and templates.
7. Shifts, then tasks.
8. Transactions, payroll, pot (needs memberships and events).
9. Patrons and patron logs.
10. Person-scoped: shouts, announcement dismissals, characters (merging the plugin-written half), feedback, follows, notifications.
11. Bot-owned tables, as agreed with Allegro.
12. Verify per domain (counts per person or venue against the source), then switch the app and the plugin to xvm-api.

Rollback idea, unreviewed: Prisma stays untouched as a read-only source, so rolling back is redeploying the old build against it. xvm-api's database needs a dump before the window so partial writes can be discarded.

## Existing scripts

| Script | Covers | Uses Prisma client? |
|---|---|---|
| `apps/web/scripts/migrate-positions.ts` | roles to positions | yes |
| `apps/web/scripts/migrate-services-to-xvm-api.ts` | services, categories, position grants | yes (and writes ids back) |
| `apps/web/backfill-venue-profile.js` | venue profile fields | yes |
| `apps/web/backfill-gallery-images.js` | gallery images to storage | yes |
| `apps/web/scripts/backfill-shouts-to-xvm-api.ts` (PR #134, parked) | shouts | **no**, reads a SQL export |

The four older scripts import the Prisma client, and they write ids back to Prisma for idempotency. **Decision:** convert them to the export-based pattern, or allow them as one-shot tools inside the window.

## Decisions needed

1. **Existing scripts:** convert to the export-based pattern, or allow Prisma in one-shot window tools?
2. **What survives from `users`:** `displayName`, `image`, `email`, `discordId`. `Person` has no field for them.
3. **History depth** for transactions, patron logs, payroll, events and shifts: all of it, or a recent slice?
4. **Frogge:** what "no impact" means; the `froggeToken` population; the tier and backdating gaps.
5. **What carries over from the old bots.** The bots are removed (decided). For each of their tables, does its data move into xvm-api (XP and levels to `LevelingMember`, warns, and so on) or get dropped? Who writes that move?
6. **Plugin-written data** (characters, sales, API keys): does the plugin switch in the window? If so its keys and routes must move together.
7. **Prod venues not connected to xvm-api:** create them in the window?
8. **Timestamps:** xvm-api stamps the copy time on shouts (no backdating). Acceptable for the other domains too?
9. **Old feedback and announcements:** move or drop?
10. **Field-level parity:** compared so far for positions, services and venues (see the venue table). Venues has real gaps: `partakeTeamId`, the Frogge columns, parts of `settings`, and inventory settings need an xvm-api home or a decision to drop. Nobody has compared the other domains.

## What this does not tell you

- **Row counts, data quality and orphans.** No prod access was used. Run a count per table on a prod copy before trusting any estimate.
- **Field parity.** A model of the same name existing in xvm-api does not mean the fields line up.
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
