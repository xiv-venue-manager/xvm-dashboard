# Frogge merge spec

Status: draft. Scope decided by Ehno on 2026-11-02: this is a platform merge, so all of Frogge's data comes across, including the servers that match none of our venues, which become venues. Not yet agreed with Allegro. Nothing here has been run. It describes how Frogge's data joins the Prisma data in xvm-api, so the two are merged where they describe the same venue or person, and loaded as new where they do not.

Read this with `docs/MIGRATION_EXPORTS.md` (the Prisma side, which is built and rehearsed) and `docs/PRISMA_MIGRATION_MANIFEST.md` (the decisions). Frogge is folding into XVM and all of its servers carry across. What remains to decide is the order and which individual features are worth carrying (section 7), and what each new venue needs (section 7, new venues).

## 1. What this covers

Frogge's data is organised by Discord server (`guild_id`), not by venue. About 92 servers, 91 rows in `guilds`, 107 tables, about 8,000 rows, 264 people with real data. Three servers are linked to a venue of ours in `v2_venues`. The staffing model (staff, employment periods, positions, events, event positions, shifts, signups) maps almost one to one onto xvm-api's. The rest (leveling, VIP, forms, reaction roles and so on) has no Prisma counterpart.

Two jobs:

1. **Merge** the staffing data for the servers that already exist as one of our venues.
2. **Load everything that does not match.** Every other server becomes a new venue and all of its data loads. This is not a later pass: for most Frogge servers it is all there is. What is open is the order and which individual features matter enough to carry; section 7 proposes a priority order.

## 2. Sources and access

| Source | How | Notes |
|---|---|---|
| Frogge database | Read-only queries on its VM (`froggebot-prod-vm`, over IAP SSH), run from Ehno's terminal | The auto classifier blocks these from Claude. Claude writes the queries, Ehno runs them and pastes the output. |
| Our side | The Prisma mapped files, `*-mapped.json` | Already produced and rehearsed. |

Row data is keyed by Discord ids. Exports are kept in a scratch directory, never committed, and deleted when the rehearsal ends. A full `pg_dump` is not used.

## 3. How things match

| Thing | Match on | If it matches | If it does not |
|---|---|---|---|
| Venue | A hand-checked list (the venue match review, section 6). `v2_venues.xvm_venue_id` and our `froggeVenueId` give 3 of 5; the other 2 are by name | Frogge's guild is attached to our venue | A new venue is created for it (section 7) |
| Person | Discord id against `person_accounts` (provider `discord`) | Reuse our person. Their display name stays ours | New person, named from Frogge's `staff_members.name` |
| Membership | person + venue | Merge (section 5) | New membership |
| Position | venue + name, case-insensitive | Merge | New position |
| Character | person + name + world | Reuse (the loader already does this) | New character |
| Event | venue + start time within 2 hours | Keep ours, attach Frogge's seats to it | New event |

## 4. Staffing: Frogge to xvm-api

| Frogge table.column | xvm-api | Notes |
|---|---|---|
| `staff_members.discord_user_id` | `person_accounts.external_id` | Finds or creates the person |
| `staff_members.name` | `people.display_name` | Only for people we do not have |
| `staff_members.birthday`, `.notes` | none | No home. Reported, not loaded |
| `staff_employment_periods.started_at`, `.ended_at`, `.ended_reason` | `employment_periods.started_at`, `.ended_at`, `.ended_reason` | Same shape. `ended_reason` values are listed in the export profile before mapping |
| `positions.name`, `.color` | `positions.name`, `.color` | |
| `positions.hourly_rate_gil` | `positions.hourly_rate_minor` | Same conversion as the Prisma mapper (`gilToMinorUnits`) |
| `positions.role_id` | `positions.discord_role_id` | Direct |
| `staff_member_positions` | `membership_positions` | |
| `events.name`, `.description` | `events.title`, `.description` | |
| `events.start_at`, `.end_at` | `events.starts_at`, `.ends_at` | A null `end_at` gets the same default length the Prisma events mapper uses |
| `events.address` | `events.location` | Truncated to 250 characters, reported |
| `events.image_url` | `events.image_url` | The image is on Frogge's own bucket. Copy it first (section 11) |
| `events.details` (JSON) | none | Theme, shout, syncshell, greeting, DJ, party finder. No home. Reported |
| `event_positions` | `event_positions` | |
| `event_shifts.start_at`, `.end_at`, `.capacity` | `event_shifts.starts_at`, `.ends_at`, `.capacity` | |
| `event_signups` | `shifts` | One shift per signup. A signer with no membership at the venue is dropped and reported |

Every Frogge row carries `guild_id`, so each one resolves to a venue through the match in section 3 or is out of scope.

## 5. Merge rules

Where both systems have the thing, the Prisma side is the base and Frogge only adds. Nothing is overwritten silently.

- **Tier:** ours wins. Frogge has no tier. A person only Frogge knows gets `staff`, unless decision 4 below says otherwise.
- **Employment period:** the start is the earlier of the two. Frogge goes back to 2026-01-24 for five Velvet Fang staff, so their start moves earlier. A closed Frogge period that ends before ours starts is added as history. Overlapping periods collapse into the earlier start.
- **Positions:** matched by name, then the Frogge hourly rate and Discord role fill in only where ours are empty.
- **Events:** a Frogge event within 2 hours of one of ours at the same venue is the same night. Ours stays. Its Frogge event positions, shifts and signups attach to it. A Frogge event with no match loads as new.
- **Characters and follows:** reused by their natural key.
- **A conflict that needs a human** (two different hourly rates for one position, two events whose seats collide) goes to the review report and the load stops until it is resolved.

## 6. Review files

Like the venue timezone review, each automatic decision is written to a file that is read before anything loads.

| File | Holds |
|---|---|
| `frogge-venue-match.json` | Each server, the venue it matched, and how (id or name). The one hand-edited input |
| `frogge-new-venues.json` | Every venue to be created: name, slug, timezone, suggested world and data centre, suggested owner. Each one is confirmed by a person |
| `frogge-people-review.json` | People matched by Discord id, with both display names, so a wrong match shows |
| `frogge-merge-conflicts.json` | Anything section 5 sends to a human |
| `frogge-dropped.json` | Rows left out and why: no membership, out of scope, no home |

## 7. Everything else Frogge holds

Every server comes across. Scope groups, from the 2026-11-01 inventory of 34 servers with real data, say how each arrives:

| Group | Servers | How it arrives |
|---|---|---|
| 1. Overlap with ours | 5 | The merge in section 5, plus any leveling, VIP, streams and rooms as new |
| 2. New staffing venues | 7 | A new venue with its staff, positions, events and the features below |
| 3. Leveling only | 4 | A new venue with its leveling members and settings |
| 4. Utility only | about 15 | A new venue with its reaction roles, sticky messages and streams |
| No data | about 58 | Decision 14: a venue now, or created when the server first installs xvm-bot |

### What a new venue needs

xvm-api requires these on every venue. Frogge holds some of them.

| xvm-api field | Frogge source | Gap |
|---|---|---|
| `name` | `guilds.name` | Untrusted text (one is a script tag). Strip and escape. Truncate to 100 characters |
| `slug` (unique) | made from the name | A suffix on collision. Reviewed |
| `timezone` | `guild_configurations.timezone` (required for every configured guild) | Alias names such as `US/Eastern` map to IANA names (decision 10) |
| `data_center`, `world` (both required) | none at the venue level. Frogge has a `world` only on characters (`profile_characters`, `verification_records`) | Decision 13. Options: look it up on ffxivvenues.com where `v2_venues.ffxivvenues_id` is set (3 venues), suggest the most common world among the server's staff characters, or store a placeholder for the owner to correct |
| owner (a membership with tier `owner`) | none. Frogge has no venue owner. Candidates: `admin_users` (30), `plugin_user_guilds` (25) | Decision 2. A venue needs an owner, and the Prisma load skipped ownerless venues for that reason |
| description, logo, banner, address | none | Left empty |

The suggestions for the last three rows go into `frogge-new-venues.json` (section 6), one entry per new venue, and a person confirms each one before the load.

### What to migrate, in priority order (proposal)

Row counts are Frogge's, from the 2026-11-01 profile, before scope is applied. Every feature below has a table in xvm-api. The priorities are a proposal for Ehno and Allegro to change.

| Priority | What | Frogge rows | If skipped |
|---|---|---|---|
| 1. Staff and events | `staff_members` 99, `staff_employment_periods` 98, `positions` 74, `staff_member_positions` 80, `events` 36, `event_positions` 220, `event_shifts` 198, `event_signups` 98, venue links 3 | about 900 | Staff history and hire dates are lost, and so are upcoming shifts |
| 2. Live community features | VIP (`vip_tiers` 8, `vip_perks` 20, `vip_members` 16, `vip_memberships` 17); leveling (`leveling_members` 64, in the 4 servers that use it); reaction roles (`reaction_role_panels` 66, `reaction_role_options` 330, templates 7); forms (6 forms, 26 questions, 41 responses); sticky messages 10; tracked streams 17; rooms 4; message templates 23; welcome posts 85; guild configuration 91 | about 830 | Members lose perks, XP and roles, and managers rebuild forms and panels by hand |
| 3. Keep if cheap | profile characters 15 (and 3 images); verification records (51 of 440 are verified, so load those only); giveaways 2 and raffles 5 with their entries; custom embeds; quote board settings 53; audit log settings 90; event templates 7 | about 240 | Little of value is lost |
| Drop | Section 8 | | |

Two things to know about priority 2. The Discord messages Frogge posted for reaction role panels, welcomes and stickies cannot be edited by another bot, so loading their configuration only helps if xvm-bot posts them again. VIP expiry needs care (section 8).

### Servers that are not venues

In xvm-api these features belong to a venue (`venue_id`), so a Frogge server that is not one of ours becomes one. Decided: all of them do. A server that only runs utility features (reaction roles, stickies) still becomes a venue so its data loads. If xvm-api has a way to mark a venue as a community server, use it.

## 8. Gaps and drops

No home in xvm-api, so reported and not loaded: staff birthday and notes, the event `details` JSON, event template positions, address and image, `guild_subscriptions`, `autorole_rules`, tournaments, and these `guild_configurations` columns (checked against xvm-api and xvm-bot on dev, 2026-11-03):

- `accent_color`: xvm-api has per-feature colours (audit log events, embeds, contests, forms, leveling) and no venue-wide one.
- `require_captcha`, `require_lodestone_proof`, `require_lodestone_verification`, `change_name`, `verified_role_id`: neither xvm-api nor xvm-bot has a member-verification flow. xvm-api has character verification for linking only. Captcha is on for all 11 venue-like servers, the Lodestone flag varies, and 51 of 440 verification records are verified. Whether xvm-bot gets such a flow is a rebuild-or-drop question for Allegro, and the default is drop.
- `staff_role_id`: no single staff-role setting. Positions carry their own Discord role, which probably covers it. Set on 7 of the 11.
- `staff_application_form_id`: forms exist, but nothing marks one as the staff application.
- `rooms_require_staff_membership`: no equivalent.
- `event_start_reminder_minutes` and `greeting_channel_id`: xvm-api defines the message types (`event.channel_reminder`, `greeting.channel`, `greeting.dm`) but has no setting for the timing or the channel, and no feature that posts a greeting on join.

These columns probably have a home and are to be confirmed when the mapper is written: `timezone` (aliases map to IANA names), `honeypot_channel_id`, `vip_warning_threshold_days` (the VIP warning days), `timeclock_auto_close_hours`, `timeclock_payout_rounding`, `event_lockout_minutes`, `require_staffing_qualification` (shifts `qualification_required`) and `profile_approval_required`. `log_channel_id` is one channel in Frogge, while xvm-api routes logs per event, so it has to be spread across the event routes.

`timeclock_finance_enabled` and `auto_reactor_enabled` are false on every venue-like server, so there is nothing to carry.

Dropped on purpose: `finance_transaction_templates` (the same 10 defaults for every server), `activity_logs` (3,095 rows, mostly config-edit noise), plugin tokens and pairing codes (everyone relinks), interaction and command usage, queues, `dashboard_whitelisted_users`. The card tables are empty and `card_game_enabled` is false everywhere.

Unverified: VIP rows. `vip_members` is current state and `vip_memberships` is history, and about 11 memberships look open but are past their expiry. They should be closed at their expiry date, not loaded as live.

## 9. Order of operations

1. Prisma load, as rehearsed. Staffing, events, finance and the rest of `MIGRATION_EXPORTS.md`.
2. Frogge staffing merge for group 1.
3. Review files read and resolved. The load of a group does not run with unresolved conflicts.
4. Create the new venues from the reviewed `frogge-new-venues.json`, then load their staffing, then priority 2 and 3 for every server.

The Frogge mappers read the Prisma mapped files and emit extra rows in the same list shapes, plus a short list of amendments (the earlier start date). The loader stays a single pass and the whole thing can be rehearsed the same way.

## 10. Checks

The Prisma rehearsal checks apply unchanged: every list loaded, counts and money sums reconcile per venue, no orphan rows, every series event sits on a generator slot. Frogge adds:

- Per overlap venue: staff, positions and events counted before and after, with the merged ones accounted for.
- No event listed twice. Run xvm-api's own event listing over the next 90 days and look for doubles, as in the Prisma rehearsal.
- Every employment period ends after it starts, and no membership has two overlapping periods.
- Every shift belongs to a membership at its venue.
- The review files are empty of unresolved items before the real run.

## 11. Hazards

- **Messages the old bot posted** (about 206: reaction roles, welcomes, events, stickies) cannot be edited by a different bot app, and their buttons stop working when Frogge's bot stops. Whether xvm-bot reuses Frogge's Discord app decides whether servers need to re-invite a bot. This is a decision for Allegro.
- **Images** are on Frogge's own bucket (19 URLs). Copy them before its project is shut down.
- **Premium:** 13 premium servers, 12 comped by hand, 1 paying through a Discord subscription. xvm-api has no tiers.
- **Server names** are untrusted text. One is a script tag. Never render them unescaped.
- **Access** to the Frogge VM is Ehno's alone. Do not automate it.

## 12. Open decisions

| # | Decision | Who |
|---|---|---|
| 1 | Which servers come across | Decided 2026-11-02: all of them (Ehno). Allegro to agree |
| 2 | An owner for each new venue. Frogge stores none. Candidates are `admin_users` and `plugin_user_guilds`; the rest are assigned by hand | Ehno and Allegro, then the owners confirm |
| 3 | Does xvm-bot reuse Frogge's Discord app, and what happens to the paying premium server | Allegro |
| 4 | The tier for a person only Frogge knows: `staff` for everyone, or use the weak hints (14 admin users, 5 plugin manager flags) to make some managers | Ehno |
| 5 | How closed Frogge employment periods are carried: as history, or only the open period | Ehno |
| 6 | The event match window (2 hours) and whether an unmatched Frogge event is loaded or reported | Ehno |
| 7 | A signup by someone with no membership: drop and report, or create the membership | Ehno |
| 8 | How a Frogge signup becomes a shift: it has no timestamp, so `claimed_at` and `approved_at` need a value | Ehno, then Allegro |
| 9 | Opening hours carried as they are, and positions carried across | Allegro |
| 10 | Timezone aliases: `US/Eastern` and similar to IANA names | Ehno |
| 11 | A server that is not one of our venues becomes a venue so its data loads | Decided 2026-11-02 (Ehno) |
| 12 | The priority list in section 7: the order, and which individual features are not worth carrying | Ehno |
| 13 | `data_center` and `world` for a new venue, which xvm-api requires and Frogge does not store: look it up, suggest it from staff characters, or use a placeholder the owner corrects | Ehno |
| 14 | The servers with no data: create a venue for each now, or only when the server first installs xvm-bot | Ehno and Allegro |
