# Events cutover, phase 3: consumers

Scoped 2026-09-26 against `origin/dev` in both repos. Phase 3 covers everything outside the events pages that reads `prisma.event`. It splits three ways, and only the first group needs neither xvm-api work nor the id bridge.

## 3a: session pages that read by time window (this branch)

These use the signed-in user's token and never join to Prisma dependents by event id.

- Overview page: live event, next event, upcoming count, last 8 events. Revenue and patron counts per event already use the event's start plus 12 hours, not an event id.
- Live page: the running event, or one starting within 30 minutes. A running occurrence of a series has no row yet, so a manager's page load materializes it.
- Live dashboard End button: sends `endTime: now`, since status is derived and no longer writable.
- Timeline route: reads the event's start from xvm-api for the `eventId` filter. Patron logs filtered by an xvm-api event id return nothing until the bridge exists (phase 5).
- `listEventsInRange` splits ranges over 60 days into windows, dedupes and sorts. The overview covers 60 days each side of now, so "upcoming" and "recent" are capped there.

## Blocked on xvm-api work: no member token

These run without a signed-in person, so they cannot call the events routes, which require a venue membership.

- `lib/venue-status.ts`, called from the bot and plugin shift routes and the status cron.
- `app/api/plugin/events/active/route.ts` and the attribution in `lib/api/plugin-auth.ts`.
- `lib/public-stats.ts` (counts across all venues).
- Crons: `update-event-statuses`, `events-digest-post`, `weekly-discord-summary`, `dispatch-notifications`, `post-partake-events`, `partake-daily-digest`.

xvm-api#51 (active-event lookup) covers the first two. Public stats need a cross-venue count. Crons need a service-credential read or a scheduled worker on the API side.

## Blocked on the id bridge (phase 5)

These join Prisma rows to events by event id, and xvm-api ids are ints.

- Patron logs page and manager, shifts page event picker, analytics route, `lib/financial-calculations.ts`, pot payroll, attendance route, `lib/shift-bot.ts`, `lib/discord-webhook.ts`, `lib/discord-feed.ts`.
- Plugin visit attribution: `PatronLog.eventId` is a Prisma foreign key to `Event`, so an xvm-api id cannot go in it.

## Consequence while the bridge is missing

The plugin keeps writing patron logs to Prisma, and for events created in xvm-api the event lookup finds nothing, so those logs carry no event id. Time-window counts (live page, overview) still work. Per-event patron logs, attendance and revenue attribution do not.
