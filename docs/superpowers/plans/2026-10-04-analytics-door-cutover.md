# Analytics door cutover (PR 2 of 2)

PR 1 moved the money fields of `GET /api/venues/[venueId]/analytics` to xvm-api. This moves the rest, so the route has no Prisma read left except the venue lookup for `xvmApiVenueId`. Stacked on PR 1 (`feat/analytics-money-xvm-api`).

## Scope

- `patronByEvent`, `summary.totalPatrons`: peak occupancy for the last seven charted events.
- `attendanceByHour`: average running count in 15-minute slots across the last 20 charted events.
- `busiestNights`: entries by weekday.
- `patronMix`, `summary.repeatRate`: new, regular and VIP by visits.
- `followers`: the total.

Dropped, as agreed: `followers.byMonth`. xvm-api only returns opted-in followers, newest first. The route returns `{}` and the page's monthly rows disappear.

## Decisions

- **Door numbers come from one set of logs.** One paged read per charted event (`event_id`, `classification=patron`, 200 per page, `before` cursor), at most 20 events. Peaks, hourly attendance and busiest nights are all computed from those rows, with the same running-count algorithm as before.
- **Busiest nights covers those events, not all time.** The old query counted every entry ever. A whole-period log stream is unbounded for "all" (12 months), so it is bounded to the recent events instead. Chosen with the user on 2026-10-04.
- **Staff crossings are excluded** from peaks, hourly attendance and busiest nights. The old code counted every log. This matches the patron mix and xvm-api's own door summary.
- **Patron mix counts distinct character and world pairs** that entered or were present (xvm-api's `visits`, which already excludes staff), instead of enters grouped by character name. People with no visits are ignored. Thresholds are unchanged: 1 to 2 new, 3 to 9 regular, 10 or more VIP.
- **The Prisma membership and role check goes.** xvm-api enforces tiers: payroll and followers are Manager only, so a non-manager gets xvm-api's 403, which the page already redirects on, and no data is returned.
- **Builders sit outside the try around the xvm-api calls**, so a bug in them is a 500 and never invalidates the user's credential.

## Design

- `lib/api/analytics-door.ts`: `fetchDoorInputs` (paged logs per event, patrons, follower count) and a pure `buildDoorAnalytics`.
- `lib/api/analytics-money.ts`: export `recentEvents` and `recentDoorEvents` so the route hands the same events to both halves.
- `lib/api/xvm-api.ts`: `before` on `listPatronLogs`, and a new `getVenueFollowers`.
- The route is rewritten to call both and merge, with the same response shape.

About 25 xvm-api calls in parallel for a busy venue (one to two log pages per event, plus patrons and followers). Authenticated calls are not rate limited.

## Verification

- Unit tests on `buildDoorAnalytics`: peaks from the running count and never below zero, the seven-event chart, staff ignored, rows read in time order, hourly slots averaged across events, weekday counts, mix thresholds, single patron, followers.
- A fetch test for paging: the cursor, `classification`, and one call for a short page.
- Client tests for `before` and `getVenueFollowers`.
- Route tests: 401, 404, 409, 503, a non-manager 403 returning no data, another xvm-api failure, the merged happy path, an unknown period.
- Knock-outs: drop the staff filter, drop the cursor, move a threshold, each failing a test.
- `tsc`, lint, full vitest, and a live check on dev against Test-Venue.
