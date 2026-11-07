# Prisma to xvm-api migration manifest

> Living document. One place that lists everything in Prisma that has to move to xvm-api in the maintenance window. Update the row when a cutover merges or a decision is made.
>
> Refreshed 2026-10-31 against `dev` at `f023c796` (`dev` was at `db18eb84` on 2026-11-01, three commits on, and the status below still holds): see "Status on dev (2026-10-31)", which supersedes the inventory below wherever they differ. Code scanned 2026-10-08 against `dev` at `e0c00438`. The scan is regex-based and counts code references only. The same day prod was also read, SELECT-only, at the owner's request, to get row counts and to check each domain's data against xvm-api's constraints. The results are in "Prod audit (2026-10-08)". Field-level parity is checked for every domain except venues, which is parked. See "What this does not tell you".

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

## Status on dev (2026-10-31)

Scanned again with the script at the end of this document, against `dev` at `f023c796`. **12 of the 41 Prisma models have any live reference, and the web app really uses 4 of them: `users`, `accounts`, `venues` and `xvm_api_credentials`.** The rest are the old bots' raw SQL, or false positives (below). The inventory below still carries the 2026-10-08 status column, so read this section first.

What changed since 2026-10-08: the Prisma shift, event and Discord shift-embed pipeline was removed (#237), follows and the notification bell moved to xvm-api (#274, #275), and the plugin routes were removed from `dev`, leaving `app/api/plugin/credentials` and `app/api/plugin/pairing-codes`. The venue bridge is almost gone: routes resolve a venue through xvm-api's `GET /me/venues`, by xvm-api id or slug, and `requireXvmVenueId` no longer exists. The Frogge integration and the shift-bot settings were removed from the dashboard (#311), a lint rule now bans new Prisma imports outside a shrinking allowlist (#316), the credential cache moved to Redis (#317), and the venue tagline, tags and adult flag now read and write xvm-api while the free-text hours and open nights were dropped (#318).

### What still touches Prisma

The scan's three raw-SQL hits in `apps/web` are false positives (an `import ... from "events"`, two lines of guide prose and a payroll dialog label), so the web app reaches Prisma only through the client.

| Where | Prisma use | Goes with |
|---|---|---|
| `lib/auth.ts` and the NextAuth `PrismaAdapter` | `users` write at sign-in (`:180`), `accounts` read for the Discord grant (`:94`), the adapter's own `users`, `accounts` and `verification_tokens` | Workstream A4 |
| `lib/api/xvm-api-store.ts` | `xvm_api_credentials`: 3 writes, 2 reads (token cache and the lazily filled `personId`) | Workstream A3 (#317 moved it to Redis; the table is now unread) |
| `app/api/venues/route.ts` | none once #319 (the `GET` list on `myVenues`) and #322 (no slug check, no bridge row on create) land | Workstream A2 |
| `lib/api/venue-access.ts` | none once #323 lands | Workstream A2 |
| `app/api/venues/[venueId]/route.ts` | none once #323 lands (the deactivate mirror) | Workstream A2 |
| `app/api/venues/[venueId]/settings/route.ts` | the `settings` JSON and `venueType`. Nothing is served from the JSON any more, so the read can go | Workstream A2 |
| `apps/eorzea-bot` (own schema, raw SQL) | `users`, `user_characters`, `venues`, `memberships`, `patron_logs`, `shifts`, `discord_members`, `discord_warn_logs` | Workstream B |
| `apps/discord-bot` (raw SQL) | `users`, `venues`, `memberships` | Workstream B |

**Discord shift signup is no longer a blocker.** It moved into xvm-bot rather than the dashboard: the posted event message has a "Pick up shifts" button that opens a screen where a member takes a seat or gives it back, and those join and withdraw as the person who pressed them (`POST /venues/{venue_id}/event-shifts/{event_shift_id}/join` and `POST /venues/{venue_id}/shifts/{shift_id}/withdraw`, with the bot's `X-Actor-Discord-Id`). With the venue's `approval_required` off, joining takes the seat at once, and `lockout_minutes` stops a member leaving too close to the start. Replacing the old Herald's Accept and Decline embeds with this was accepted by the owner on 2026-10-31, so the embeds need no equivalent. xvm-api #111 asked for the underlying support and is closed. What is left for Workstream B on shifts is the old bots' own reads (`apps/eorzea-bot`'s `myprofile` and `venue/roll`), and clock-in and clock-out in xvm-bot, tracked in xvm-bot #51 (the calls) and #52 (a `/timeclock` command).

Both bots are still services in `docker-compose.yml`, with `DATABASE_URL`. So is `xiv-stats`, whose source lives outside this repository, so what it reads is not known.

The other 29 models have no code reference: `notifications`, `shout_templates`, `sessions`, `verification_tokens`, `venue_schedules`, `venue_schedule_entries`, `roles`, `membership_role_assignments`, `event_templates`, `services`, `transactions`, `tasks`, `payroll_entries`, `pot_distributions`, `venue_pot_settings`, `venue_inventory_settings`, `webhooks`, `feedback`, `api_keys`, `shift_audit_logs`, `shift_signup_embeds`, `pending_notifications`, `venue_follows`, `announcements`, `announcement_dismissals` and the four old-bot `discord_*` config tables. For the migration they are "cut over" or "dead" as the inventory describes, and each still needs its data moved or dropped. Inventory rows marked Live that no longer have web code behind them: `shifts`, `shift_signup_embeds`, `pending_notifications`, `api_keys`, `venue_inventory_settings` (now the `inventory` module toggle through xvm-api), `events`, `services`, `user_characters` (web side) and `patrons`.

### Remaining work, in order

**A. Finish the dashboard on `dev`.** #308, #311, #313, #315, #316, #317 and #318 have merged. Open: #319, #320, #321, #322 (stacked on #319), #323 (stacked on #322) and #324 (the adapter flip, not to merge before the window).
1. A1: done. #308 narrowed the `GET /api/venues` select, and #319 replaces that select with `myVenues`.
2. A2, venue residue. Done: tagline, tags and the adult flag read and write xvm-api, and the free-text hours and open nights are gone (#318). Open: `GET /api/venues` on `myVenues` (#319), dropping `notifications` from the mapper's leftovers (#320), the settings route's Prisma read (#321), the create route's bridge row and Prisma slug check (#322, stacked on #319), and the deactivate mirror plus the dead bridge helpers `roleInVenue`, `myVenueRoles`, `requireVenueRole` and `tiersFor` (#323, stacked on #322). With those merged in order, A2 is finished in code. `notifications` is a dead key: nothing reads or writes it, and 9 of 74 prod venues hold four unused toggles. xvm-api refuses a taken slug with "A venue with this slug already exists.", so the wizard's collision retry still matches (read in source, not tried over the wire). `asMembership` stays: the `GET` list uses it. No new decision is needed. Only `eorzea-bot` reads the Prisma `venues` table in prod (raw SQL), and its removal was decided on 2026-10-08, so venues created (#322) or deactivated (#323) after those PRs ship are missing or stale in it until it is removed. Prod is not on xvm-api yet, so this has no effect before the window.
3. A3: done (#317, merged 2026-10-31). The person's token is one shared copy in Redis (`xvm:credential:<userId>`, which also carries `personId`). A first version kept it in the session JWT and failed review: xvm-api keeps one live Dashboard credential per person and every exchange revokes the others. See "Removing the credential cache".
4. A4, the NextAuth adapter, following `docs/superpowers/plans/2026-10-08-nextauth-adapter-removal.md`. Task 1 (Discord grant from the JWT) shipped as #178 on 2026-10-11, and the display-name row as #179. The plan's precondition grep prints nothing on `dev` (checked 2026-11-01). The flip (plan Tasks 3 and 4) is built as #324: no adapter, `token.id` is the Discord id, and the cookie is renamed to `xvm.session-token` (with the `__Secure-` prefix only over https), so everyone signs in once more. Checked live on 2026-11-01 with a real Discord sign-in: the callback succeeds with no adapter, the credential is stored in Redis under the Discord id, and the new cookie is set. A scratch merge of #319 to #324 then listed the owner's three venues from the dev xvm-api with no Prisma error and a clean lint, so the stack works together and the settings page, a tag and tagline save, and a venue deactivate were clicked through against the dev xvm-api and all worked, with no Prisma call. One save first returned a 503 from a revoked credential and worked on retry, which is the shared-credential design (one live Dashboard credential per person), not a fault. The venue banner did not load because the CSP `img-src` omitted `images.ffxivvenues.com` (#325). After the A2 stack and #324 merge, no file in `apps/web` imports Prisma outside `lib/prisma.ts` and the scripts. #324 differs from the plan in two places: a failed token exchange at sign-in stays non-fatal, because the refresh path re-mints on the next callback, and there is no `token.personId`, because the credential store carries it (#317). #324 should not merge before the migration window, since it signs everyone out and stops creating `users` rows that `eorzea-bot` reads.
5. A5, sweep: the lint rule banning `@/lib/prisma` outside an allowlist that shrinks to empty is in (#316) and the `timeline-feed.tsx` type import is gone (`lib/roles.ts`). What is left is emptying the allowlist as A2 to A4 land, and the stale docs. The `frogge/**` and `xvm-connect/**` entries are already gone. One entry remains once #321, #322, #323 and #324 land, plus `scripts/**` (three scripts still import Prisma): `lib/prisma.ts`. It goes with the Prisma teardown (F). None can go before A2 and A4 land.

**B. The old bots and other readers.** Remove `apps/eorzea-bot` and `apps/discord-bot` (decided 2026-10-08) once xvm-bot covers what they do. xvm-api now has leveling (#207, #224) and account deletion (#217). Allegro decides which data carries over (decision 5): XP and levels (84 members, see decision 13), warns, open-venue state. Also repoint or retire `xiv-stats`, `adminer` and the xiv-admin TUI, which read the Prisma database directly. xvm-bot#33 tracks the Discord posts prod makes today that stop at the migration.

**C. The data move.** Mappers exist for 14 domains (`lib/migration/*`, `scripts/map-*.ts`). What is left:
- There is no agreed loader yet. A prototype exists on a local xvm-api branch (`feat/legacy-loader`, one commit, about 900 lines, worktree `~/xvm-api-loader`, unpushed). It has only run on synthetic data. Whether to build the load that way, and where it lives, are open, and xvm-api is Allegro's repo. As built it reads the mapped files, resolves the `*_key` references, writes into xvm-api's tables in one transaction with original dates, and reconciles counts and sums. Per-event attendance and revenue totals, venue `leftovers` and the pot-enabled flag have no xvm-api column, so it reports them and does not load them.
- Prod counts and schema drift were re-read on 2026-11-01 (see "Prod re-check (2026-11-01)"). The constraint checks against xvm-api are still the 2026-10-08 ones and have to be repeated on the rehearsal copy.
- Rehearse the whole sequence on a fresh prod copy and reconcile counts and sums.
- Never load `pending_notifications`.

**D. The plugin.** xvm-api is not public yet (`api.xivvenuemanager.com` does not answer; the pairing plan's DNS, tunnel and public-route tasks are not done), and every relink exchanges its code there, so that comes first. The owner makes the public route in Cloudflare (the owner owns the server). Checked 2026-11-01: only `xvm-api-dev` (port 8001) and `cloudflared` run on the server, with no Caddy and no production xvm-api container, so a production instance has to be deployed first, not the dev one. The route is a proxied CNAME `api` to the tunnel plus a tunnel ingress entry for the hostname; the server's API token probably cannot create DNS records, so the record is added in the Cloudflare dashboard. On the production hostname only, add a tunnel ingress rule (hostname `api.xivvenuemanager.com`, path `/internal/.*`, service `http_status:404`) ahead of its main rule, since only the dashboard's token exchange uses `/internal` and the dashboard reaches xvm-api inside the network. Leave `dev-api.xivvenuemanager.com` as it is: it already exists (tunnel entry to `xvm-api-dev` on port 8001, checked 2026-11-01), its `/internal`, `/docs` and `/openapi.json` are public, and a dev dashboard may call it by that address. Whether the production hostname should also hide `/docs` and `/openapi.json` is open. Done 2026-11-01: the two tunnel ingress entries are in place (the `/internal` 404 rule, then `api.xivvenuemanager.com` to `http://192.168.1.122:8002`, the port chosen for the production instance), with the previous config saved on the server as `~/tunnel-config-backup-1793521792.json`. The DNS CNAME `api` to the tunnel (proxied) was added by the owner in the Cloudflare dashboard, because the server's token cannot read or create DNS records, and the route was verified on 2026-11-01 through Cloudflare's edge: `/health` and `/pairing/exchange` answer 502 because nothing listens on port 8002 yet, `/internal/tokens/exchange` answers 404 from the tunnel rule, and `dev-api` is unchanged. The owner expects that the production xvm-api cannot be deployed until all the API work is complete (2026-11-01), so the container, the load, the adapter flip (#324) and the plugin relink all wait on it, and the route sits idle until then. Open on 2026-11-01: xvm-api #231 (platform XP), #209, #147, #117, #104, #83, #70, and xvm-bot #12, #28, #33, #51, #52; which of these must finish before deploying is not yet decided. Still to do: the production xvm-api container on port 8002 (shaped like `xvm-api-dev`, a fresh database migrated with `alembic upgrade head`), then a re-check on the production hostname. The rate limit was checked on 2026-11-01 against `dev-api`, which uses the same tunnel path: 13 bad `/pairing/exchange` calls gave ten 400s then 429s, 13 more with a different forged `X-Forwarded-For` each gave the same (a caller cannot pick a bucket), and with this machine's `/health/deep` bucket held full, a phone on mobile data (a different public address) still got a normal 200, so buckets are per real client behind Cloudflare. The one gap in that test is that the phone's load could have fallen in a moment when this machine's bucket had just reset. No xvm-api change is needed for the rate limit: `rate_limit.py` on `dev` already trusts `X-Forwarded-For` only from a trusted proxy and reads it from the right by `PROXY_HOPS`, so behind the tunnel (a private peer, one hop) it should key on the real client address, which should be confirmed live with two addresses after setup. The pairing plan's Task 2 is superseded by that. `/pairing/exchange` is limited to 10 attempts a minute per client address. Then ship the release that talks to xvm-api directly, with the announcement ahead of it. 85 people used a key in the last 30 days and all of them relink.

**E. The window.** Order as in "Proposed order inside the window". Back up prod and xvm-api's database first. Rollback is redeploying the old build, because Prisma is only read during the window.

**F. Teardown, after the window is verified.** In this order: delete the code and `lib/prisma.ts`, then `schema.prisma`, `generated/prisma`, `prisma.config.ts` and the `prisma generate` postinstall, then the Dockerfile and CI steps, then the compose services and `DATABASE_URL`, then the one-off `map-*` scripts. Keep the old database read-only and backed up for a set period before dropping it.

### Waiting on Allegro

- Frogge (decision 4): what "no impact" means, tier assignment, and the 3 venues with a `froggeToken`.
- Old-bot data (decision 5).
- The Discord post tracking on 10 events (1 upcoming), and xvm-bot#33.
- Which xvm-api tables and columns a direct load may rely on, and whether the load is built as the prototype is.

### Not verified in this refresh

- Checked 2026-11-01: prod runs `eorzea-bot`, `xiv-stats` and `ehnotwitchbot` (all up 4 weeks) and no `discord-bot` container, so `discord-bot` is not live. `xiv-stats` (source at `/home/server/xiv-stats` on the server, a 99-line `server.js`, not in this repository) does read the Prisma database directly: read-only counts of `users`, `venues`, `events`, active `events`, `transactions`, `memberships`, `roles`, `services` and `tasks`, served as JSON to the homepage widget with an API key, plus unresolved GlitchTip issues. After the migration those counts stop moving. xvm-api's `/public/stats` covers only active venues and their published events, so repointing covers 2 of the 9 numbers; the rest would need admin reads or be dropped. Its `server.js` also holds a hardcoded fallback database connection string, with the database password, and a default API key; the compose file sets `DATABASE_URL`, so the fallback is not used, and it was removed on 2026-11-01: `server.js` now reads both from the environment and exits at startup if either is missing, and the service was rebuilt and checked (`/stats` and `/glitchtip` answer 200 with the key, 401 without it, and the old default key is refused). No older image was left after the rebuild. The database password is unchanged. The owner confirmed on 2026-11-01 that it was not exposed, so no rotation is planned.
- Whether any loader's output matches prod. The prototype has only run on synthetic data, and the rehearsal on a prod copy has not happened.
- Whether any client depends on the Prisma venue id that `GET /api/venues` returns today.
- The 10-08 prod audit's constraint findings. Counts and schema drift were re-read on 2026-11-01, the field-by-field checks were not.

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
| `accounts` | r web 2, w web 1 | Live | `PersonAccount` | Owned by next-auth's `PrismaAdapter` (`lib/auth.ts`). Stays until auth leaves the adapter, which is the long pole in the decommission notes. The plan is `docs/superpowers/plans/2026-10-08-nextauth-adapter-removal.md`: the adapter is the last link (after the plugin cutover and the credential cache), and its Task 1 (Discord grant from the JWT) ships first. Holds Discord OAuth tokens, which are not worth migrating. |
| `sessions`, `verification_tokens` | none | Dead | none | Sessions are JWT. Confirm empty or irrelevant, then drop. |
| `xvm_api_credentials` | r web 3, w web 3 | Live | none | A cache of the person's xvm-api token. Nothing to migrate. #317 moved it to Redis (`xvm:credential:<userId>`), which removed the table's last reader; the table can be dropped. See "Removing the credential cache". |

### Venues

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `venues` | r web 131, w web 7, raw web 1, bot 3, dbot 1 | Live | `Venue`, `VenueProfileSettings`, `VenueDiscordSettings`, `VenueImage`, `VenueExternalLink` | Most reads are the `xvmApiVenueId` bridge. **No prod venue is on xvm-api** (prod's `venues` table does not even have the `xvmApiVenueId` column), so the window creates 63 of the 69 (decision 7). Existing scripts: `backfill-venue-profile.js`, `backfill-gallery-images.js`. Carries `froggeToken` (see Frogge). `discordWebhookUrl` is deprecated but still read and written. A field-by-field map is not written. |
| `venue_schedules`, `venue_schedule_entries` | none | Dead | `VenueHours` | Retired from the app per code comments (`venues/[slug]/page.tsx`, `api/public/venues/route.ts`). Issue #57 still describes a Prisma write; its text predates this and should be rechecked. Hours live in xvm-api. |
| `venue_follows` | r web 2 (the bot clock-in route and the dispatch cron, both deleted by #237) | Cut over | `VenueFollow` | Follow, unfollow, the follow state on discover, following and the venue page, and the follower counts all read and write xvm-api (`/me/follows`, `PublicVenue.follower_count`, `getVenueFollowers`). The table holds only the pre-window rows: 88 of 89 load in the window, and the app reads only xvm-api once this deploys, so the load must run with or before that deploy. The venue-opened and event-reminder DM fan-outs were dropped (xvm-api#200). Toggles were decided DROP. |
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
| `events` | r web 11, w web 9, raw web 1 | Live | `Event`, `RecurrenceRule` | Five crons and `lib/partake.ts` still read it; Partake sync still writes it (#57). The recurrence models differ (Prisma pre-generates occurrences, xvm-api materialises them), so this needs its own mapping. |
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
| `transactions` | none | Cut over | `Transaction` | The daily-sales-summary cron was the last reader and is deleted (webhook retirement, decision 2026-09-09: the summary posts again as a scheduled job on the xvm-api and bot side, Allegro's). Sales are written through `lib/api/transactions.ts` into xvm-api. Decide how much history moves. |
| `payroll_entries`, `pot_distributions`, `venue_pot_settings` | none | Cut over | `PayrollEntry`, `PotDistribution`, `VenuePayrollSettings` | Move needed. Whether pot settings map to `VenuePayrollSettings` is not confirmed. |

### Shifts and tasks

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `shifts` | none in web or discord-bot; eorzea-bot raw SQL (`myprofile`, `venue/roll`) | Cut over | `Shift` | The dashboard pipeline was removed in #237, and Discord signup moved into xvm-bot (see the note above). Only the old Aetherlink's reads remain (Workstream B), plus the export scripts. |
| `shift_audit_logs` | none | Cut over | `ShiftAuditEntry` | Read only by the export script. |
| `shift_signup_embeds` | none | Cut over | none (bot-owned) | `lib/shift-bot.ts` is gone. Signup moved into xvm-bot. The 13 embed links are dropped in the shifts map. |
| `tasks` | none | Cut over | `Task`, `TaskCategory` | Move needed. Needs memberships first. |

### Notifications

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `notifications` | none | Dead | `Notification` | The bell reads `/me/notifications` and marks read through `PATCH /me/notifications/read`; xvm-api emits the rows. |
| `pending_notifications` | none | Cut over | none | Its readers, the bot clock-in route, the dispatch cron and the plugin shift routes, are gone. Only `schema.prisma` names it. |
| `webhooks` | none | Dead | `VenueLogRoute` | Webhooks are being retired (decision 2026-09-09). Routing settings that live in `Venue.settings` need a home. |

### Person-scoped

| Prisma table | Dev code | Status | xvm-api target | Notes |
|---|---|---|---|---|
| `shout_templates` | none | Cut over | `ShoutTemplate` | Script and pattern: PR #134 (merged; the shouts step of the migration, to run in the maintenance window, not before). Needs the Discord id to person mapping. |
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
- The dashboard's Frogge routes (`frogge/disconnect`, `frogge/members`, `frogge/redeem`) and the settings card were removed by #311. `Venue.froggeToken` still holds the tokens, and the dashboard no longer reads it.
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
- **The credential cache.** `XvmApiCredential` moves to Redis, one copy per person (#317), not into the JWT; see "Removing the credential cache".

Only when all three are gone can the Prisma client, `prisma generate`, `schema.prisma` and `lib/prisma.ts` be deleted.

### A guard while it shrinks

Once step 2 is done, a lint rule like the one planned for `prisma.membership` (#136, Task 8) can ban `prisma.venue` outside an allowlist. The allowlist shrinks as step 3 lands, so nothing new can depend on the bridge.

**Built (#316, merged 2026-10-31):** an ESLint `no-restricted-imports` rule bans `@/lib/prisma` and `generated/prisma` outside an allowlist in `apps/web/eslint.config.mjs`. It covers all Prisma use, not only `prisma.venue`.

## Removing the credential cache

> **Outcome (2026-10-31).** Option B was built (#317): one copy per person in Redis under `xvm:credential:<userId>`, with `personId` kept in the same value. Option A (JWT only) was built first and failed review. xvm-api keeps one live Dashboard credential per person and every exchange revokes the others, so a token in each browser's cookie is revoked by the next sign-in on another browser while its own cookie still looks fresh, and an account deletion leaves the other browsers signed in on a revoked token. One shared copy avoids both, as the table row did. The plugin cutover removed B's objection below: nothing outside a browser session needs a person token any more, so a Redis flush or eviction costs one re-mint on the next request. The analysis and the recommendation below are kept as the record of why.

`xvm_api_credentials` caches each person's xvm-api bearer token (`token`, `credentialId`, `expiresAt`, `personId`). Everything goes through four functions in `lib/api/xvm-api-store.ts`, and `getValidXvmApiToken(userId)` is the one that matters. Earlier notes called moving it into the JWT "independent of everything else". Checked against `dev` on 2026-10-08, that is not true.

### Who needs a token, and whether a browser session is behind it

| Context | Call sites | Browser session? |
|---|---|---|
| Dashboard routes and pages, `getValidXvmApiToken(session.user.id)` | 144 | yes |
| Helpers that take a `userId` from those same callers (`xvm-page-read`, `event-visibility`, `rooms/[roomId]`, `venues`) | about 8 | yes, derived |
| **Plugin routes** (`events/active`, `patron-visits`, `patrons/ban`, `banned`, `present`, `rooms`, `rooms/reserve`, `rooms/release`) through `pluginXvmContext`, plus `lib/api/transactions.ts` | 10 files | **no**: the plugin authenticates with an API key and the route looks up that key's user |
| Staff removal (`staff/[membershipId]` DELETE) | 1 | n/a: it reads the table to map an xvm-api person back to a Prisma user |
| Old migration scripts | 4 | n/a, retired |

A token carried in the session JWT works for the first two rows only. The plugin rows have no cookie, and they already depend on the stored token: when it is missing they answer "xvm-api link expired. Sign in to the dashboard again to refresh it."

### Options

| Option | What it does | Problem |
|---|---|---|
| A. JWT only | Token lives in the encrypted session cookie, read server-side | Breaks every plugin route until the plugin stops needing a person token |
| B. Redis instead of Prisma | Same four functions, different store | Removes the Prisma table now and covers the plugin. Redis is fail-open and volatile, so a flush drops tokens and plugin sales fail until that person next opens the site |
| C. JWT plus the table | Sessions use the JWT, the plugin keeps the table | Two token sources that can disagree, and the table stays. A transitional state |
| D. Mint on demand | Call the token exchange when a token is needed | Each exchange creates a new 30-day credential row in xvm-api, so this churns credentials unless the result is cached, which is option B again |

### Recommendation

Do not start the JWT move yet. **It follows the plugin cutover.** Once the plugin talks to xvm-api with its own venue-narrowed credentials (the same change that removes the plugin's Prisma venue id), nothing outside a browser session needs a person token, and the move is small: one server-side helper reads the token from the JWT, and the 144 callers do not change because the function signature already hides the store.

Two details for when it is built:

- The token must stay **server-only**. It must not appear in what the `session` callback returns, because that object is readable by the browser at `/api/auth/session`. Read it with `getToken` from `next-auth/jwt` instead.
- The `jwt` callback currently reads the table to decide whether to re-mint, and NextAuth runs that callback each time the session is read, so most authenticated requests pay for that read twice (once there, once in the route). The JWT removes both.

### Worth doing sooner, independent of the above

The staff-removal route revokes a departing member's plugin API keys by finding their Prisma user through `XvmApiCredential.personId`. Its own comment says that column is filled lazily, so a member who never triggered the lookup keeps their keys. The manager-visible roster already carries `person.discord_id`, so the link can be `Account` (provider `discord`, `providerAccountId = discord_id`) instead. That fixes the gap and removes the route's only direct use of the table.

### Not verified

- That NextAuth invokes the `jwt` callback on every session read is documented behaviour, not something I measured; I did not count database reads.
- Whether production Redis persists across restarts. `docker-compose.yml` runs it with `--save "" --appendonly no` and `--maxmemory 256mb --maxmemory-policy allkeys-lru`, so a restart or an eviction drops the credential, and each person's next request mints a new one. Harmless now that the plugin is cut over. This is the compose file, not a read of the production container.

## Deploy-time and teardown items

Things the cutover PRs say must happen at the `dev` to `main` deploy or in the final teardown, gathered here so they are not only in PR bodies. State as of 2026-10-25, checked against `dev`.

At the deploy, not before:

- **Discord Interactions Endpoint URL.** It is one setting on the Discord application, shared by dev and prod. #237 deleted the route behind it, but prod's shift buttons keep working from `main`, so clear it in the deploy window, not earlier.
- **`CRON_SECRET` stays in the environment.** `app/api/diag/sentry-test` still reads it, so do not prune it with the cron variables.
- **The legacy shift bot (`apps/eorzea-bot`)** is not deployed on dev and is deleted from the server after the merge (decided 2026-10-25). Its dead `/webhook/event-live` and `/webhook/shift-xp` listeners go with it.
- **Follows backfill runs with or before the deploy** (#274). 88 of the 89 follows load. Run after, existing follows disappear from the UI while the Prisma rows stay safe.
- **Shouts backfill** (`backfill-shouts-to-xvm-api.ts`, #134) runs in the window, before the app starts reading xvm-api.
- **xvm-api#215.** Check prod's `venue_payroll_settings` for `auto_close_after_hours` above 168. A value above about 17.7M hours would stop the auto-close sweep for every venue.

In the final teardown (take a backup first, as for any prod schema change):

- Prisma models with no callers left after #237: `shiftSignupEmbed`, `pendingNotification` and `event`.
- `discord_open_venues` (8 rows) and its web `DiscordOpenVenue` model, plus the `region:*` rows in `discord_tracked_messages`.
- The Frogge columns on `Venue`, after the 3 connected venues are confirmed (see "Frogge").

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

About 16,000 rows in all on 2026-10-08 (21,829 on 2026-11-01, see below). A load takes seconds, and a rehearsal on a prod copy is cheap. The window is mostly verification.

### Prod re-check (2026-11-01)

Read-only again (`BEGIN READ ONLY` then `ROLLBACK`, exact `count(*)` per table and `information_schema.columns`), at the owner's request. Nothing on prod changed.

**Counts.** 45 tables, 21,829 rows. Every table in the 10-08 list is still there. The five empty ones are `device_tokens`, `discord_guild_config`, `pot_distributions`, `verification_tokens` and `webhooks`. Growth since 10-08 (old to new): `patron_logs` 9,695 to 12,273, `pending_notifications` 2,212 to 2,488 (never loaded), `shifts` 1,026 to 1,219, `events` 534 to 667, `shift_audit_logs` 887 to 1,006, `patrons` 760 to 838, `payroll_entries` 303 to 332, `users` 254 to 277, `accounts` 252 to 275, `venues` 69 to 74, `discord_members` 68 to 84, `api_keys` 146 to 164, `memberships` 248 to 263, `user_characters` 137 to 156, `transactions` 114 to 124. Only `venue_follows` fell, 89 to 88. The field-by-field constraint checks were not repeated, so the new rows are unchecked against xvm-api's limits.

**Schema drift against `dev`'s `schema.prisma`: unchanged since 2026-10-09.** Prod has and `dev` drops: `patrons.isVip`, `vipSetAt`, `vipSetById` and `venues.location`. `dev` expects and prod lacks: `venues.xvmApiVenueId`, `xvmApiVenueLinkedAt`, `xvmApiVenueLinkedBy`, `services.xvmApiServiceId` and the table `xvm_api_credentials`. Prod-only tables: `rooms`, `device_tokens`, `notification_preferences`, `refresh_tokens`, and `_RoleToService` (Prisma's implicit join table). The `dev` schema has not moved, so the SQL in #177 (`docs/deploy/*.sql`) still applies.

### Decisions

| # | Topic | Status | Answer |
|---|---|---|---|
| 1 | Existing scripts | Decided | Convert them to the export-based pattern (no Prisma client). They lose "write the id back to Prisma" as their idempotency mechanism, so each needs another way to stay re-runnable (a mapping file kept outside Prisma). |
| 2 | What survives from `users` | Decided | `discordId` becomes a `person_accounts` row (provider `discord`); `displayName` becomes `Person.display_name`; `email` becomes a `person_accounts` row (provider `email`, `external_id` the address; Allegro confirmed on 2026-10-11 that this is intended: `PersonAccountModel.provider` is a free `String(32)` and every lookup is provider-scoped, so an email row cannot be read as a Discord identity or become a login path. Set `verified_at` to NULL on migrated emails, since they came from `users.email` and were never confirmed); `image` is dropped (refreshed from Discord at sign-in). Prod `users` also holds `isAdmin` (1 platform admin, maps to `Person.is_platform_admin`), a `displayName` that wins over `name` (33 of the 41 people who set one changed it from their Discord name, so use `displayName` when set), and `settings.notifications` (11 people, no xvm-api home). Users are emailed when a venue is set up, and owners can be emailed through xiv-admin. That mail flow is reworked after `dev` reaches `main`. |
| 3 | History depth and dates | Decided | All history, with original dates wherever they feed a venue's analytics (transactions, payroll, shifts, patron logs, events, tasks). Shout dates do not matter. Because the API cannot backdate, the load writes straight into xvm-api's Postgres (option 3). |
| 4 | Frogge | Allegro | Their question. What "no impact" means, tier assignment, and the 3 connected venues. See "Waiting on Allegro". |
| 5 | Old-bot data | Allegro | Allegro manages xvm-bot and decides what carries over. |
| 6 | Plugin | Decided | The plugin switches to xvm-api in the window. Every plugin user relinks with a pairing code; old keys are not carried. No grace period for old routes is assumed (they would return an update-and-relink message). |
| 7 | Prod venues | Decided | No prod venue is on xvm-api. All are created in the window except the 2 ownerless empty ones (`zino`, `Chaoslord171`) and the 4 test venues (`venueType` `TEST_VENUE`, decided not to migrate; see `docs/MIGRATION_EXPORTS.md`). 63 of 69 migrate, where this row first said 67. The 41 venues with no events or transactions were counted before the test venues were ruled out. |
| 8 | Timestamps | Decided | Analytics dates are kept (decision 3). Shouts and other non-analytics data may take the copy time. |
| 9 | Feedback and announcements | Decided | Drop old announcements. Keep feedback: the 17 open items stay live, the real completed ones are archived, about 10 test or message items are dropped. |
| 10 | Field parity | Done except venues | See the per-domain notes. Venues are parked. |
| 11 | Pot `enabled` flag | Decided, then reversed (#326, xvm-api#233) | The first decision (Allegro suggested, 2026-11-01 confirmed) was to derive the flag from positions, because xvm-api had no venue-level pot flag. That was reversed: xvm-api now stores it (xvm-api#233), and each `payrollSettings` row carries it as `pot_enabled`, true for the 3 venues that had the pot on and false for every default row. `potEnabledVenues` is gone from the mapper. Deriving would have been wrong: checked on prod 2026-11-01 (read-only), `tba` has 11 roles, all `pot`, but `thelucidlounge` (4 roles) and `velvet-fang` (3 roles) have the flag on with every role `standard`, so deriving would have turned off 2 of the 3. No venue has a `pot` role with the flag off. None of the three has a pot distribution or a payroll entry. Module toggles (`VenueModuleModel`, names `rooms` through `auto_reactor`, no `pot`) are listed and set by routes, but nothing in xvm-api reads `enabled`, so no toggle is enforced today. |
| 12 | Financial history | Decided (owner, 2026-11-01) | Keep all of it. Checked on prod 2026-11-01 (read-only): stored event revenue is 39 events and 83,881,838 gil; 38 of them equal the sum of their transactions and the 39th (42,400 gil) has none, which the load turns into one `other_income` transaction, so no revenue is lost. The minor unit is one gil, but rounding the 31 payroll rows that hold fractions (up to 0.48 each) changes no total: the exact and rounded payroll totals are both 286,805,061 gil. Hours are rounded to whole minutes on 152 rows with the stored total kept. The only entries not loaded are 2 paid hourly payroll entries with 0 hours, a 0 rate and a 0 total (2026-08-19 and 2026-09-02, no notes); they hold no money or hours, and the owner accepted on 2026-11-01 that they are not loaded, so the mapper's skip stays and 301 of 303 payroll entries load. 86 payroll entries get `period_end` moved to start plus one day, because the database requires an end after the start; amounts are unchanged. The counts above have grown since 2026-10-08 (transactions 124, not 114), so the audit must be re-run before the load. |
| 13 | Old-bot XP and levels | Decided (owner, 2026-11-01): all 84 members carry over, including the 2 on the test server (`ehnocure` 8,508 XP, `ladylestrange` 4,020 XP, who appear only there). XP and levels are XVM-wide and belong to people, not to Discord servers. xvm-api has no such scope today: every leveling route and table is under a venue (`leveling_members` is keyed `venue_id` + `person_id`), so this needs Allegro. Proposed as xvm-api#231 (2026-11-01): a person-scoped platform XP next to venue leveling, not a reserved platform venue, which was checked and works only for the bot (person reads 403 without a membership, `is_active` is the only hiding flag, and a venue must keep an owner). Detail: | Prod `discord_members` (read-only, 2026-11-01) has 84 rows, not 68: 82 in guild `1509616350337962024` (89,900 XP) and 2 in `1521908394850779247` (12,528 XP), 102,428 XP in all. The stored `level` is 1 for every row and is not used; the bot computes `floor(sqrt(xp / 100))` with a minimum of 1, and shows Grand Company rank names from XP thresholds. xvm-api keeps leveling per venue (`leveling_members`: `venue_id`, `person_id`, a `total_xp` cache, and `leveling_awards` with a `manual` source and a note), and derives level from a per-venue curve `quadratic*L^2 + linear*L`. XP maps as one `manual` award per member, so totals are exact. A curve of quadratic 100 and linear 0 reproduces the old levels, because the old level is the L where XP reaches `100*L^2`; the default 5 and 50 would show about level 40 for 10,000 XP where the bot shows 10. Guild `1509616350337962024` (82 members) is the Aetherlink bot's prod `GUILD_ID` per the owner's notes, so it is the community server the bot runs in, not a venue's (confirmed by the owner on 2026-11-01: it is their community server). Guild `1521908394850779247` (2 members, 1 warn) is probably a test server, since its id sits next to the bot application's id; this is inferred, not confirmed. Open: xvm-api needs a person-scoped (platform-wide) place for it, and neither guild is any venue's `discordServerId`; and the Grand Company, rank names, `gil`, `warns`, XP boost and cooldown skips have no home. |
| 14 | Discord `email` scope at sign-in | Decided (owner, 2026-11-01): keep it | The sign-in asks for `identify email guilds`. The email stays in the session token only and is never written to a table (after #324), and the no-Discord user's address is not stored anywhere. Dropping the scope was considered and not done. |

### Per-domain notes

Each entry gives what loads, how the fields map, and what is fixed or dropped on the way. "Minor unit" is 1 gil.

**Persons.** Every user who has a membership, character, payroll entry or other reference gets a `Person` with a `discord` account row. Two special cases: 29 distinct manual payroll payees (below) and one user with no Discord identity (below) get a `Person` with no Discord account.

**Venues (parked).** 69 in prod, 63 migrate (the 2 ownerless empty ones and the 4 test venues are skipped). Name, slug, description, logo, banner, address, data centre, world, active flag and the four visibility settings map to `VenueModel`. 320 gallery images over 42 venues (all plain URLs) become `VenueImage`. `partakeTeamId` (7 venues) and `ffxivVenueId` (5) become `VenueExternalLink` rows (providers `Partake` and `FFXIVVenues`). The legacy `location` column restates district, ward and plot and is dropped. All 69 venues have timezone `UTC` while their events carry real zones (Edmonton 205, UTC 168, Los Angeles 38, New York 27, Berlin 23, Riyadh 20); proposed rule: venue timezone is its most common event timezone, else UTC. `venueType` has 10 values plus 22 null (4 are `TEST_VENUE`; skip or migrate is open). `settings` JSON keys with **no xvm-api home**: `openNights` (22), `defaultHours` (20), `shiftBot` (21) and `notifications` (9). The three that now have xvm-api homes are `tagline` (11 venues), `tags` (17) and `isAdult` (21), moved by #318. The hours, nights, shift-bot and notification keys are dropped by decision and stay in Prisma's JSON until teardown. `notifications` held four toggles (`newFollower`, `dailySummary`, `eventRsvp`, `lowStaffCoverage`) that nothing read. `discoverySources` (one venue has data) is dropped. The webhook flags (26) and `discordWebhooks` (19) are retiring. Address data, read again on 2026-10-12 (`venues.sql`, read-only, at the owner's request, nothing written to disk): the 63 venues that have an address all use one of the five district names exactly as xvm-api spells them, no venue has an apartment (`apartment` is null on every row, plots run 1 to 58 and wards 1 to 30 with no sentinel values), and 6 venues have no address at all (district, ward and plot all null, all six with content), so #187 would prompt 6 owners once. The subdivision question for apartments and the in-game spelling of districts do not arise for prod data.

**Positions and memberships.** `roles` (228) become positions: hex colour to integer, `potPayoutMode` to `standard`/`pot`/`contractor`, hourly rate to minor units (47 have one). No role has any permissions, so no capabilities are needed. 60 roles are unused defaults and still load. `memberships`: 216 active (76 owners, 23 managers, 117 staff) become memberships with one open employment period starting at `hireDate`. The 32 pending invites (11 manager, 21 staff) have no user, have all expired, and are dropped. One membership hourly rate (500 gil, the owner's own test account at Velvet Rift) has no home and is dropped. Custom role and additional role assignments become `membership_positions`. No inactive members, no temporary roles, no duplicates.

**Services.** 166 over 18 venues, 395 role grants (every service has some). Price to minor units, the 26 free-text categories become `service_categories`, grants become `service_positions` through the role to position map, 38 linked items become `service_inventories`. The one stock count without a linked item ("1h Bar Buyout" at Ash & Amaranth, count 3) is dropped because xvm-api inventory requires an FFXIV item. No duplicate names, no negative or fractional prices.

**Events.** 534 over 27 venues (2022 to 2027). xvm-api has no stored status: draft is `published_at` null, published, active and completed set `published_at`, cancelled sets `cancelled_at` (the 21 cancelled events have no date, so their `updatedAt` is used). The 167 Partake links, reminder times and creators map directly. Recurrence: 16 parents (14 weekly, 1 biweekly, 1 monthly) with 308 children become `recurrence_rules` plus occurrence slots (`scheduled_at`); the monthly one needs a by-date or by-weekday call. Fixes: one event with end equal to start gets +3 hours; two titles over 200 characters (218 and 210) are cut to 200 with the full title put at the top of the description; the single event template is junk and dropped. `attendanceCount` (67 events) and `revenue` (35) have no home; 65 and 34 of them can be derived from patron logs and transactions. For the remainder, 2 events get one synthetic headcount log and 1 event (42,400 gil) gets one `other_income` transaction, each noted as migrated. The stored attendance was lower than xvm-api's derived figure on 63 of 65 events, so the derived figure is the one shown from now on. `partakeAttendeeCount` is dropped (the next sync refills it). The Discord post tracking on 7 events is a question for Allegro.

**Shifts.** 1026 over 21 venues, 887 audit entries. Zero hard-constraint violations. xvm-api derives status from timestamps: scheduled sets `claimed_at` and `approved_at`, the 7 claimed shifts set `claimed_at` only, cancelled sets `cancelled_at` from `updatedAt` (the real time was never stored). Claim and approval times come from the audit log where it has them (134 and 251 of 431 assigned shifts), else the creation date. Role to position, reminder time kept, hours worked dropped (derived), the 13 signup-embed links dropped (bot-owned), payroll links kept. After xvm-api #186 a shift is a person's seat on an event shift, so the map changes shape. A shift with an event and a position becomes a seat: one event position per event and position, one event shift per window, with a capacity that counts its open slots (the open rows themselves are dropped). Someone with two live seats on one window keeps the first, and an unstarted second is cancelled with a note, or put on an event shift of its own if both were worked. A worked shift with no event or position is kept as a walk-in, so payroll history survives; an unworked one with nowhere to sit is skipped. Recurrence is dropped: the 94 parents, 406 children and 62 slot groups were already separate rows, and xvm-api no longer has shift series. Audit actions go to lower case; `CANCEL_SERIES` becomes `cancel` with a note; `web`/`admin` sources become `dashboard`, `plugin` stays, `discord` becomes `bot`, `xiv-admin` becomes `system`, and the 11 manual edits keep their original source in the note. **Rule:** any shift still clocked in at load time is ended at its own scheduled end, with a `clock_out` entry. (Three stale clock-ins were already closed in prod on 2026-10-08; see below.) A shift open at the window with no scheduled end, or one whose scheduled end is still in the future, needs a manual call.

**Transactions.** 114 over 11 venues, 110 sales and 4 tips, all positive whole gil. `created_at` and `posted_at` both take the original date, status `posted`, the staff member becomes `membership_id` and `recorded_by_person_id`, the service name is copied in. No xvm-api change.

**Payroll.** 303 entries over 7 venues. Gil to minor units (31 rows had fractions); hours to whole minutes, rounded (152 rows), with the stored total kept unchanged. Two things need handling: 35 manual entries (33 fixed, 2 hourly) have a typed name and no membership, while xvm-api requires a person, so each distinct name becomes a placeholder `Person` (no account, no membership), after the export merges the obvious duplicates; the 35 entries are all paid, from 2026-01-09 to 2026-07-18 over two venues (`n` 31, `dreamsong` 4), about 51.9M gil. Decided 2026-11-01: Discord is required for anyone who signs in, but these payees never do, so they stay placeholders (xvm-api's `PayrollEntryModel.person_id` is NOT NULL and `membership_id` is optional; a placeholder can be folded into a real account later with the person-merge service). Export merges: `auroa storm` into `aurora storm`, `dj jay sylverhart` into `jay sylverhart`, `djay kk` into `dj kk`, which takes the 29 names to 26. `ehno cure` (one hourly entry, 2M gil, venue `n`) is the owner and maps to the owner's real account (user `ehnocure`), not a placeholder. `dr event`, `dr prize pool` and `strip dr pool` are prize pools or event payouts, not people; they load as placeholders named for what they are, so the venue's payout history stays right; and 86 entries have a period that starts and ends at the same instant, which xvm-api rejects, so `period_end` is set to `period_start` plus one day. The 2 paid hourly entries with a total of 0 are dropped, so 301 of 303 load. No pot distributions exist.

**Patron logs and patrons.** 9695 logs over 14 venues and 760 patrons over 8. `ENTER` becomes `enter`, `LEAVE` and `EXIT` become `leave`. 921 logs (2026-04-17 to 2026-07-29) have `countChange` 0, which would make xvm-api's entries, exits and peak occupancy read zero for that period; they get +1 or -1. Of those, 11 nameless rows carry nothing and are dropped, so 9684 load. Six patrons were unbanned but still have a ban date, and xvm-api treats any ban date as banned, so `banned_at`, the reason and the banning person are cleared on unbanned patrons. One patron is actually banned.

**Characters.** 137 over 118 users map to `person_characters` with the same name and world, `self_declared`. No case-insensitive duplicates. The one user with characters and no primary gets their oldest as primary.

**Follows and notifications.** 88 of 89 follows load (one follows a skipped venue). The 289 old in-app notifications, the single notification-preferences row and all 2212 pending notifications are dropped. **The pending queue must never be loaded:** all 2212 are unsent and 2189 are past due, and xvm-api's dispatcher would send every one of them on its first run.

**Pot, inventory, tasks, rooms.** `venue_pot_settings` (18, three enabled) map to `venue_payroll_settings` (tax percent times 100 gives basis points); the `enabled` flag becomes `pot_enabled` on that row (xvm-api#233), and generating a pot for a venue that has it off is refused. Deriving it from pot-paying positions was ruled out: 2 of the 3 venues with the pot on have no such position. `venue_inventory_settings` (18, five enabled) map to the `inventory` module toggle. Tasks (27 over 10 venues, all assigned to a role or to nobody) map to `tasks` with priorities 0 to 3, `assignedRoleId` to `assigned_position_id`, and `updatedAt` as the start date of the four in-progress ones. Rooms (22 over 6 venues) map directly; none is occupied, locked, owned, linked to Frogge or has an image. `shout_templates` (4) are covered by PR #134.

**API keys (146).** 111 are active and 85 distinct people used a key in the last 30 days. Keys are stored as hashes and cannot be carried over, so everyone relinks. That needs an announcement beforehand and a pairing-code screen or xvm-bot command (the route needs a person credential, and nothing has been checked yet on the dashboard side). One active key belongs to the user with no Discord identity (below). `refresh_tokens` (59) and `sessions` (1) are dropped.

**Schedules.** 28 entries over 15 venues are the only structured hours for three venues (After Effect, Cream Nightclub, The Black Dahlia). The five venues that sync from ffxivvenues.com repopulate through xvm-api's `ffxivvenues` hours source, so their 5 raw synced payloads are dropped and the 8 entries that belong to them are not carried. About 20 manual entries are loaded as `venue_hours` with recurrence rules (default, not yet confirmed by the owner).

**The user with no Discord identity.** Decided 2026-11-01 by the owner: Discord is required from now on, so there is no no-Discord path. The one affected staff member (at The Final Act; user `ibummelz`, created 2026-06-25, one membership, one character, owns no venue, no `accounts` row; their user row and plugin key were made by hand) is mapped to a normal `Person` with a `discord` account row, using their Discord user id, which the owner will fetch. They then relink like everyone else. Their main concern was their email address: prod holds none for them (`users.email` and their membership's `invitedEmail` are both null), and the mapper creates an email account row only when a user has an address, so none is stored. Discord itself holds the address, and the dashboard never persists it. The Discord id was pulled from Discord and confirmed by the owner on 2026-11-01; it is held outside the repo and not recorded here. Earlier notes said they did not want Discord; the owner is aware of that.

### Changes already made to prod

| Date | Change | Backup |
|---|---|---|
| 2026-10-08 | Three clock-ins that had stayed open (two at The Final Act for 5 and 19 days, one at G-Bathhouse for 20 hours) were ended at their scheduled ends: status completed, hours set, three `CLOCK_OUT` audit rows (source `manual`, same as earlier manual closes). | `~/db-backups/shifts-before-close-20261008-2120.sql` on the server (data only; restoring needs `--disable-triggers` because `shifts` references itself) |

### Proposed order inside the window

Draft, not rehearsed. Everything loads straight into xvm-api's Postgres except shouts.

Before: announce the relink, ship a plugin release that talks to xvm-api, dump prod and dump xvm-api's database, rehearse the whole sequence on copies.

1. Take prod down. Export each table to SQL or JSON.
2. Persons and their account rows (including the 29 payee placeholders and the no-Discord user).
3. Venues (63), external links, images, hours and recurrence rules, module toggles.
4. Positions, memberships and employment periods, membership positions.
5. Services, categories, grants, inventory.
6. Events and recurrence rules; the three synthetic attendance and revenue rows.
7. Shifts and their audit entries; tasks; rooms; payroll entries; transactions; patron logs and patrons; characters; follows; feedback.
8. Shouts, through the existing API-based script.
9. Verify: counts per venue and per person, and sums for money, hours and attendance, against the source.
10. Switch the app and the plugin to xvm-api. Every plugin user relinks.

Rollback idea, unreviewed: Prisma is only read during the window, so rolling back means redeploying the old build against it. xvm-api's database needs a dump first so partial writes can be discarded.

### Waiting on Allegro

- Whether the per-venue module toggles are enforced anywhere is still open: `VenueModuleModel` exists, and nothing that enforces a toggle has been traced.
- Frogge (decision 4) and the old-bot data (decision 5).
- What to do with the Discord post tracking on 10 events (1 upcoming) (`discordMessageId` and related columns).
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
| `apps/web/scripts/backfill-shouts-to-xvm-api.ts` (PR #134, merged) | shouts | **no**, reads a SQL export |

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
