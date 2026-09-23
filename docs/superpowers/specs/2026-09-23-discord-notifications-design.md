# Discord notifications after the webhook retirement

**Date:** 2026-09-23
**Scope:** dev only. The dashboard side is ours; xvm-api and xvm-bot work is Allegro's and is only described here, not built.

## Problem

Venues configure six Discord notifications in Settings → Integrations → Discord Webhooks. Each group gets one pasted webhook URL:

| Group | Notifications |
|---|---|
| Staff | Task created, Task completed, Staff joined |
| Events | Partake event mirror |
| Sales | Sale logged, Daily sales summary |

The dashboard's webhook system is being retired (decision 2026-09-09: delete, don't port), and Discord posting moves to xvm-bot. On dev, all six webhooks still fire. The daily sales summary also posts wrong numbers, because its cron reads Prisma transactions and those stopped updating at the Transactions cutover.

## What already exists (xvm-api, Allegro's)

- **`VenueLogRouteModel`** (`models/notifications.py`): a per-venue `event_key` → `channel_id` + `enabled` table, unique on `(venue_id, event_key)`. Its keys include `sale.logged`, `sales.daily_summary`, `task.completed`, `staff.joined`, `event.created`. It's model-only: no router, and nothing reads or writes it.
- **Activity log** (`ActivityLogService.record()`), the natural trigger source. Nothing calls it yet (xvm-api#98).
- **`VenueExternalLinkModel`** with provider `DiscordGuild` holds a venue's Discord server id, exposed through the venues router.
- **xvm-bot#12** tracks the one-shot notification cog. It hasn't been started.

## Decisions

1. **Remove the webhooks now and accept the gap** until the bot side ships (user, 2026-09-23, reaffirming 09-09). No flag and no dual system.
2. **Settings UI is grouped, storage is per type.** The UI keeps the three groups. Each group has one channel picker plus an on/off toggle per notification. Saving writes one `VenueLogRoute` per type.
3. **Channel picker first**, not a typed-ID box. How the picker gets the channel list is Allegro's call. Both options go in the handoff (see Handoff 4).

## Part 1: ownership and order

| Piece | Owner | When |
|---|---|---|
| Remove the six webhooks from the dashboard | dashboard | now |
| Log-routes endpoint (list + upsert `VenueLogRoute`) | Allegro | their schedule |
| Channel list for the picker | Allegro | their schedule |
| Triggers: `record()` call sites, log entry → bot post | Allegro (xvm-api#98, xvm-bot#12) | their schedule |
| Daily sales summary as a scheduled job | Allegro | their schedule |
| Posting cog | Allegro (xvm-bot#12) | their schedule |
| "Discord notifications" settings section + channel picker | dashboard | after the endpoint and channel list exist |

## Part 2: the removal (first dashboard PR)

**Delete:**
- The notification sends:
  - `saleLogged` in `lib/api/transactions.ts`
  - `taskCreated` in `app/api/venues/[venueId]/tasks/route.ts`
  - `taskCompleted` in `app/api/venues/[venueId]/tasks/[taskId]/route.ts`
  - `staffJoined` in `app/api/invites/[token]/accept/route.ts`
  - the `partakeEvent` post in `app/api/cron/post-partake-events/route.ts`
- The whole `app/api/cron/daily-sales-summary` route (its only job is the webhook post), **and its schedule**, wherever that's configured (find it during planning).
- The "Discord Webhooks" section of the settings page, and the six toggle fields plus the three group URLs in `app/api/venues/[venueId]/settings/route.ts`.
- The now-unused webhook-type config in `lib/discord-webhook.ts` (`WebhookType`, type→group mapping, `getWebhookUrlForType`, `VenueWebhookConfig` if nothing else uses it).

**Keep:**
- The admin feedback webhook (`app/api/feedback/route.ts`). It's a platform alert, not a venue notification, so `sendDiscordWebhook` stays.
- Everything else in `post-partake-events` (import, reminders, shift-embed cancellation). Only its webhook post goes.
- Venues' saved webhook URLs in Prisma `Venue.settings` JSON. They're left in place, unread. No database operation.

**Done when:** no venue-notification webhook call remains; `tsc`, `vitest` and lint pass; the settings page renders without the section; the daily cron is unscheduled.

## Part 3: "Discord notifications" settings section (after Allegro's endpoints)

- **Placement:** Settings → Integrations, where Discord Webhooks was. Manager/Owner only (xvm-api enforces this too).
- **Layout:** three groups (Staff, Events, Sales). Each group has one channel picker and a toggle per notification type.
- **Group ↔ routes mapping:** one pure, unit-tested function in each direction.
  - **Save:** for each type in a group, upsert `{event_key, channel_id: groupChannel, enabled: toggle}`. A cleared group channel sets `enabled: false` on its routes.
  - **Load:** a group's channel is taken from its routes. If they disagree (someone edited routes directly), use the most common channel and show the group as mixed.
- **Event keys:** `task.created`, `task.completed`, `staff.joined`, `sale.logged`, `sales.daily_summary`, and a Partake-mirror key that Allegro names. `task.created` isn't in the model's key list yet, which the handoff notes.
- **Channel picker (reusable, alignment item #3):**
  - Resolves the venue's Discord server from its `DiscordGuild` link, fetches channels from Allegro's source, and lists text channels by name.
  - If the list can't load, it falls back to a typed channel ID with a "how to copy a channel ID" hint, and logs the status code (the Frogge `discord-rest.ts` pattern).
  - Intended to replace the raw-ID inputs in the reaction-role panels (#61) and the Aetheryte Herald settings later. That's out of scope here.
- **Edge states:**
  - No `DiscordGuild` link: tell the venue to link its server first; no empty pickers.
  - xvm-bot not in the server (channel list 404 or empty): tell the venue to add xvm-bot.
  - Save failure: error toast; nothing partially saved is shown as saved.
- **Partake mirror:** Partake import is still a dashboard cron writing Prisma events (moving it is xvm-api#20). The toggle only does anything once Allegro decides how the bot learns about new Partake events.
- **Testing:** unit tests for the mapping functions; picker fallback behaviour; a live check on local dev.

## Handoff 4: comment on xvm-bot#12

Posted as a comment on the existing tracking issue, linking xvm-api#98 and #20:

1. The dashboard removes the webhooks from dev now, gap accepted. The new UI uses `VenueLogRoute` as modelled: grouped in the UI, one route per type.
2. Needed: a log-routes endpoint (list + upsert per venue: `event_key`, `channel_id`, `enabled`; Manager tier).
3. Event keys: as listed in Part 3, with `task.created` added and the Partake key named by Allegro.
4. Channel list, Allegro's choice:
   - (A) share xvm-bot's token so the dashboard calls Discord through the already-ported `lib/discord-rest.ts`. Proven in Frogge, but a bot token can't be scoped.
   - (B) an xvm-api endpoint backed by an xvm-bot channel cache. Cleaner ownership, more work.
   - Either way the dashboard reads the server id from the venue's `DiscordGuild` link.
5. Triggers: from #98's `record()` calls. The daily summary needs a scheduled job. The Partake mirror depends on #20, or another event source.
6. Out of scope for the dashboard: all bot and API work. The settings UI gets built once items 2 and 4 exist.

## Out of scope

- Any xvm-api or xvm-bot code.
- Migrating or deleting stored webhook URLs.
- Notification message content and formatting (the bot's job).
- Replacing the other raw channel-ID inputs with the picker.
