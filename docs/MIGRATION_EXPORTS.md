# Migration export layer

How the dashboard's Prisma data gets ready to load into xvm-api. Read this with `docs/PRISMA_MIGRATION_MANIFEST.md`, which holds the decisions; this file says what was built, in what order to run it, and what it produced on the last prod read.

It describes twelve PRs (#162 to #173). Until they merge, the paths below exist only on those branches.

## What it is, and what it is not

Each domain has three parts:

| Part | Where | Job |
|---|---|---|
| Export | `apps/web/scripts/export/<domain>.sql` | One read-only `SELECT` that returns one JSON document. Every timestamp is explicit UTC |
| Mapper | `apps/web/lib/migration/<domain>.ts` | A pure function from the export to the rows xvm-api needs. No Prisma, no network, tested |
| Runner | `apps/web/scripts/map-<domain>.ts` | Reads the export and the earlier mapped files, writes the mapped JSON, prints counts and skip reasons |

**It does not load anything.** Nothing here writes to xvm-api or to Prisma. The loader is a separate piece, and it waits on Allegro saying which xvm-api tables a direct load may rely on.

Every row is keyed by its Prisma id, so the loader can assign real xvm-api ids and then rewrite the keys. Two keys are built, not copied: a manual payroll payee is `payee:<name folded to lower case>`, and a category is `<venue id>|<name folded to lower case>`.

## Run order

Each mapped file feeds the ones below it. Run from `apps/web`.

```bash
ro() { psql "$DATABASE_URL" -q -At -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on" -f -; }

# 1. people first, everything keys off them
ro < scripts/export/people.sql     > people.json
npx tsx scripts/map-people.ts people.json people-mapped.json

# 2. positions and memberships
ro < scripts/export/positions.sql  > positions.json
npx tsx scripts/map-positions.ts positions.json people-mapped.json positions-mapped.json

# 3. events
ro < scripts/export/events.sql     > events.json
npx tsx scripts/map-events.ts events.json people-mapped.json events-mapped.json

# 4. services
ro < scripts/export/services.sql   > services.json
npx tsx scripts/map-services.ts services.json positions-mapped.json services-mapped.json

# 5. the rest
ro < scripts/export/characters.sql > characters.json
npx tsx scripts/map-characters.ts characters.json people-mapped.json characters-mapped.json

ro < scripts/export/shifts.sql     > shifts.json
npx tsx scripts/map-shifts.ts shifts.json people-mapped.json positions-mapped.json events-mapped.json events.json shifts-mapped.json

ro < scripts/export/finance.sql    > finance.json
npx tsx scripts/map-finance.ts finance.json people-mapped.json positions-mapped.json events-mapped.json services-mapped.json finance-mapped.json

ro < scripts/export/patrons.sql    > patrons.json
npx tsx scripts/map-patrons.ts patrons.json people-mapped.json events-mapped.json patrons-mapped.json

ro < scripts/export/follows-feedback.sql > follows-feedback.json
npx tsx scripts/map-follows-feedback.ts follows-feedback.json people-mapped.json follows-feedback-mapped.json scripts/export/feedback-exclude.json

ro < scripts/export/tasks-rooms.sql > tasks-rooms.json
npx tsx scripts/map-tasks-rooms.ts tasks-rooms.json people-mapped.json positions-mapped.json tasks-rooms-mapped.json

ro < scripts/export/hours.sql      > hours.json
npx tsx scripts/map-hours.ts hours.json hours-mapped.json

ro < scripts/export/settings.sql   > settings.json
npx tsx scripts/map-settings.ts settings.json settings-mapped.json
```

Dependencies, so a PR can be reviewed alone:

| Needs | Slices |
|---|---|
| Nothing | people, hours, settings |
| people | characters, positions, events, follows and feedback |
| people, positions | services, tasks and rooms |
| people, events | patrons and patron logs |
| people, positions, events (and the raw events export) | shifts |
| people, positions, events, services | transactions and payroll |

The runners read each other's output as JSON and never import each other's code, so the PRs merge in any order.

## The PRs

| PR | Domain | Maps to (xvm-api) |
|---|---|---|
| #162 | People | `people`, `person_accounts` (Discord, and email kept apart) |
| #163 | Characters | `person_characters` |
| #164 | Positions and memberships | `positions`, `memberships` (one open employment period), `membership_positions` |
| #165 | Services | `service_categories`, `services`, `service_positions`, `service_inventories` |
| #166 | Events | `recurrence_rules`, `events` |
| #167 | Shifts | `recurrence_rules`, `shifts`, `shift_audit_entries` |
| #168 | Transactions and payroll | `transactions`, `payroll_entries` |
| #169 | Patrons and patron logs | `patrons`, `patron_logs` |
| #170 | Follows and feedback | `venue_follows`, `feedback` |
| #171 | Tasks and rooms | `task_categories`, `tasks`, `rooms` |
| #172 | Opening hours | `venue_hours` (each with its rule) |
| #173 | Pot and inventory settings | `venue_payroll_settings`, an `inventory` module toggle |

## What the last prod read produced

Read-only, 2026-10-09. These are the numbers a rehearsal run should land on, give or take rows added since.

| Slice | Source | Mapped | Skipped | Notes |
|---|---|---|---|---|
| People | 255 users, 30 payee names | **233** (204 users, 29 payees) | 51 unreferenced | 203 Discord accounts, 202 email accounts, 1 person with no Discord |
| Characters | 138 | 138 | 0 | 119 people, one primary each |
| Positions | 228 | 228 | 0 | 47 with a rate |
| Memberships | 249 | 216 (76 owners, 23 managers, 117 staff) | 33 pending invites | 262 position assignments |
| Services | 167 | 167 | 0 | 27 categories, 398 grants, 38 inventories, 1 stock count dropped |
| Events | 535 | 535 | 0 | 16 rules, 324 events in series, 91 attendance or revenue totals |
| Shifts | 1,030 | 1,030 | 0 | 63 rules, 500 in series, 891 audit entries |
| Transactions | 119 | 119 | 0 | total **146,457,938** gil |
| Payroll | 303 | 301 | 2 | total **260,792,561** gil |
| Patrons | 762 | 762 | 0 | 1 banned |
| Patron logs | 9,777 | 9,766 | 11 | entries **5,028**, exits **4,738** |
| Follows | 89 | 89 | 0 | 63 venues |
| Feedback | 44 | **33** | 11 left out by decision | 17 open, 16 closed. The eleven are listed in `scripts/export/feedback-exclude.json` |
| Tasks | 27 | 27 | 0 | 10 venues, 16 categories |
| Rooms | 22 | 22 | 0 | 6 venues |
| Opening hours | 28 | 20 | 8 | the 8 belong to the 5 venues synced from ffxivvenues.com |
| Pot settings | 18 | 4 rows | 14 all default | 3 venues have the pot on |
| Inventory settings | 18 | 5 module toggles | 13 off | |

These match the manifest where it gave numbers. Where they differ the difference is rows added since its 2026-10-08 snapshot.

## Fixes the mappers make

Each is a counted warning, not a silent change.

- **Zero-count patron logs:** 913 named entries and exits get +1 or -1. 11 nameless zero-count rows are dropped.
- **Banned flags:** 6 unbanned patrons still had ban data, cleared.
- **Payroll:** 31 fractional gil amounts rounded, 152 hourly entries with hours rounded to whole minutes (the stored total is kept), 86 periods that did not end after they started set to end a day later, 2 paid hourly entries with a total of 0 dropped.
- **Events:** 1 end that was not after its start moved to start plus 3 hours, 2 titles over 200 characters cut with the whole title kept in the description.
- **Opening hours:** an end before the start is treated as the next day, and an entry with no end gets 3 hours.
- **Daylight saving:** Prisma added whole days in UTC, so occurrences drifted an hour. See below.

## Things the loader must handle

1. **Assign ids, then rewrite keys.** Insert in dependency order: people, venues, positions, memberships, services, events and rules, shifts, payroll, transactions, patrons, then the small ones.
2. **Backdated dates.** Rows keep their original `created_at`, which the API cannot set, so the load writes straight into xvm-api's Postgres.
3. **Venue filtering.** Every mapped file is keyed by Prisma venue id and includes venues that will not migrate (two ownerless empty ones and the four test venues, per the manifest). Filter after the venues slice exists. One follow already points at a skipped venue.
4. **Dropped payroll entries.** Two payroll entries are skipped, and shifts reference payroll entries by key, so clear that link on any shift that points at one.
5. **Daylight saving on series.** 98 of 324 event occurrences have `starts_at` an hour off their series wall-clock time. The events mapper keeps the real `starts_at` and sets `scheduled_at` to the series' own slot, which assumes xvm-api's generator computes the same slot. Shifts have no separate canonical slot, so a drifted shift cannot be tied to its series. Both need proving in the rehearsal.
6. **Rules are emitted `enabled: true`.** Whether enabling a rule duplicates the loaded future events and shifts is an open question for Allegro. The loader can flip it.
7. **Series timezones.** Prisma shifts and opening hours have no timezone. Shift rules take the most common timezone of the venue's events, which makes 54 of 63 shift rules UTC, and opening hours are UTC. This is the proposed venue timezone rule, not a decided one.
8. **Never load the pending notification queue.** It is not exported. 2,212 unsent rows would all be sent by xvm-api's dispatcher on its first run.
9. **People who need a decision.** One person has no Discord identity (a pairing code is issued by hand). Email accounts come out in their own list and wait on Allegro confirming that `person_accounts` may hold contact addresses. 29 payroll payees are placeholder people, and one payee name matches a character name, a likely merge.

## Not exported, on purpose

- The 289 old notifications, the notification preferences, and the pending notification queue.
- `accounts` tokens, `sessions`, `verification_tokens`, `xvm_api_credentials`, `refresh_tokens`, `device_tokens` (nothing to migrate, see the manifest).
- Plugin API keys. Everyone relinks with a pairing code.
- Event templates (the one is junk), old announcements, Discord post message ids, and the old-bot tables.
- Venues themselves, venue settings and gallery images (the venues slice, parked).

## Decisions still open

| Who | Question |
|---|---|
| Allegro | Which xvm-api tables a direct load may rely on |
| Allegro | The pot `enabled` flag has no home: a column, a `pot` module, or derive it from positions that pay from the pot |
| Allegro | Does enabling a recurrence rule duplicate loaded future events and shifts |
| Allegro | May `person_accounts` hold contact emails, and should a no-Discord person path exist |
| Allegro | Where the venue settings listed in the manifest live |
| Dashboard | The venue timezone rule |

## Safety when running it

- The export is a read-only session (`default_transaction_read_only = on`). Nothing writes to prod.
- Do not take a full `pg_dump` for this. It would copy every OAuth token in `accounts` to the machine running the exports, and the exports only need a handful of columns.
- The export files hold names, Discord ids, emails and feedback text. Keep them in a scratch directory and delete them when done.
- Each mapper has its own tests (`pnpm exec vitest run lib/migration`). A mapped run that skips or warns more than the table above is worth a look before anything loads.

## The rehearsal

The full rehearsal comes once every slice, the venues slice and the loader exist: load a copy of prod into a real xvm-api, then reconcile counts per venue and per person, and the sums above (transactions, payroll, entries and exits) against the source. Per-slice runs, like the table above, are checks along the way and not the sign-off.
