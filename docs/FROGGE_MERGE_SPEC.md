# Frogge merge spec

Status: draft, not agreed with Allegro. Nothing here has been run. It describes how Frogge's data joins the Prisma data in xvm-api, so the two are merged where they describe the same venue or person, and loaded as new where they do not.

Read this with `docs/MIGRATION_EXPORTS.md` (the Prisma side, which is built and rehearsed) and `docs/PRISMA_MIGRATION_MANIFEST.md` (the decisions). Frogge is folding into XVM and its venues carry across. Scope is not settled; section 7 lists what each choice changes.

## 1. What this covers

Frogge's data is organised by Discord server (`guild_id`), not by venue. About 92 servers, 91 rows in `guilds`, 107 tables, about 8,000 rows, 264 people with real data. Three servers are linked to a venue of ours in `v2_venues`. The staffing model (staff, employment periods, positions, events, event positions, shifts, signups) maps almost one to one onto xvm-api's. The rest (leveling, VIP, forms, reaction roles and so on) has no Prisma counterpart.

Two jobs:

1. **Merge** the staffing data for servers that already exist as one of our venues.
2. **Load everything that does not match.** This is not a later pass. For most Frogge servers it is all there is. The question is not whether to load it but which of it matters enough to carry; section 7 proposes a priority order.

## 2. Sources and access

| Source | How | Notes |
|---|---|---|
| Frogge database | Read-only queries on its VM (`froggebot-prod-vm`, over IAP SSH), run from Ehno's terminal | The auto classifier blocks these from Claude. Claude writes the queries, Ehno runs them and pastes the output. |
| Our side | The Prisma mapped files, `*-mapped.json` | Already produced and rehearsed. |

Row data is keyed by Discord ids. Exports are kept in a scratch directory, never committed, and deleted when the rehearsal ends. A full `pg_dump` is not used.

## 3. How things match

| Thing | Match on | If it matches | If it does not |
|---|---|---|---|
| Venue | A hand-checked list (the venue match review, section 6). `v2_venues.xvm_venue_id` and our `froggeVenueId` give 3 of 5; the other 2 are by name | Frogge's guild is attached to our venue | Group 2 servers get a new venue; the rest are not venues |
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
| `frogge-people-review.json` | People matched by Discord id, with both display names, so a wrong match shows |
| `frogge-merge-conflicts.json` | Anything section 5 sends to a human |
| `frogge-dropped.json` | Rows left out and why: no membership, out of scope, no home |

## 7. Everything else Frogge holds

Scope groups, from the 2026-11-01 inventory of 34 servers with real data:

| Group | Servers | What it brings | Needs |
|---|---|---|---|
| 1. Overlap with ours | 5 | The merge in section 5, plus any leveling, VIP, streams, rooms | Nothing new |
| 2. New staffing venues | 7 | A new venue, its staff, positions, events | An owner for each, and a timezone |
| 3. Leveling only | 4 | Leveling members and settings | A venue to hang them on, or a decision to drop |
| 4. Utility only | about 15 | Reaction roles, sticky messages, one stream | Probably not venues. Decide whether they carry across at all |

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

In xvm-api these features belong to a venue (`venue_id`). A Frogge server that is not one of our venues has nowhere to put its data unless it becomes one. That affects scope groups 3 and 4, and possibly some of group 2:

- **Make each one a venue,** marked as a community server if xvm-api has a way to say so. Everything loads. This is the simplest way to lose nothing.
- **Drop the ones that only have utility features.** Reaction roles and stickies on a server with no staff or events may not be worth a venue.

This is decision 11 below.

## 8. Gaps and drops

No home in xvm-api, so reported and not loaded: staff birthday and notes, the event `details` JSON, event template positions, address and image, `guild_subscriptions`, `autorole_rules`, tournaments, several `guild_configurations` flags.

Dropped on purpose: `finance_transaction_templates` (the same 10 defaults for every server), `activity_logs` (3,095 rows, mostly config-edit noise), plugin tokens and pairing codes (everyone relinks), interaction and command usage, queues, `dashboard_whitelisted_users`. The card tables are empty and `card_game_enabled` is false everywhere.

Unverified: VIP rows. `vip_members` is current state and `vip_memberships` is history, and about 11 memberships look open but are past their expiry. They should be closed at their expiry date, not loaded as live.

## 9. Order of operations

1. Prisma load, as rehearsed. Staffing, events, finance and the rest of `MIGRATION_EXPORTS.md`.
2. Frogge staffing merge for group 1, then group 2.
3. Review files read and resolved. The load of a group does not run with unresolved conflicts.
4. Priority 2, then priority 3, for the servers in scope.

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
| 1 | Which servers come across (groups 1 to 4) | Ehno and Allegro |
| 2 | An owner and a timezone for each new venue in group 2 | Ehno, then the owners confirm |
| 3 | Does xvm-bot reuse Frogge's Discord app, and what happens to the paying premium server | Allegro |
| 4 | The tier for a person only Frogge knows: `staff` for everyone, or use the weak hints (14 admin users, 5 plugin manager flags) to make some managers | Ehno |
| 5 | How closed Frogge employment periods are carried: as history, or only the open period | Ehno |
| 6 | The event match window (2 hours) and whether an unmatched Frogge event is loaded or reported | Ehno |
| 7 | A signup by someone with no membership: drop and report, or create the membership | Ehno |
| 8 | How a Frogge signup becomes a shift: it has no timestamp, so `claimed_at` and `approved_at` need a value | Ehno, then Allegro |
| 9 | Opening hours carried as they are, and positions carried across | Allegro |
| 10 | Timezone aliases: `US/Eastern` and similar to IANA names | Ehno |
| 11 | A server that is not one of our venues: make it a venue so its data loads, or drop it | Ehno and Allegro |
| 12 | The priority list in section 7: which of priorities 2 and 3 are worth carrying | Ehno |
