# Analytics money cutover (PR 1 of 2)

`GET /api/venues/[venueId]/analytics` reads Prisma for everything. Sales, door logs and events now write to xvm-api, so on dev the endpoint returns zeros and empty lists while xvm-api holds nine events. This PR moves the money fields to xvm-api. PR 2 moves the door fields.

## Scope

Moves to xvm-api in this PR:

- `revenueByEvent` (revenue, payroll, net profit for the last 10 completed or active events)
- `serviceRevenue` (top 5)
- `summary`: `totalRevenue`, `avgRevenuePerEvent`, `avgSpend`, `totalTransactions`, and the event counts (`total`, `upcoming`, `completed`, `recentCount`)
- `financial` (revenue against paid payroll over the span of the last 10 events)

Stays on Prisma until PR 2 (already stale, not made worse): `patronByEvent`, `attendanceByHour`, `patronMix`, `busiestNights`, `repeatRate`, `totalPatrons`, `followers`.

Dropped: `followers.byMonth`. xvm-api only returns opted-in followers, newest first, so a history cannot be rebuilt. Decided with the user on 2026-10-04.

## Decisions

- **"All" is the last 12 months.** xvm-api caps a request at 60 days, so every list is chunked. Other periods are 30 and 90 days as today.
- **Revenue is posted, unvoided, entry type revenue.** xvm-api's own rule is "only posted rows count". The list endpoint already excludes voided rows. Pending rows are filtered client side by `status`.
- **Payroll keeps the current period rule.** An event gets every paid entry whose period contains the event's day, so a multi-event period is still counted against each event. This is the existing `TODO(payroll-alloc)`, kept as is so no number changes silently. xvm-api now links pot payouts to their event (`pot_distribution_id`), which could fix it later.
- **`avgSpend` becomes consistent.** It was the last 10 events' revenue divided by every transaction ever. It is now revenue over the fetched rows divided by their count.
- **Full cutover, no fallback.** A venue without an xvm-api link gets the standard 409 `not_connected`. The route keeps its Prisma membership and role check, because PR 1 still reads Prisma for door fields; PR 2 removes it.

## Design

One module, `lib/api/analytics-money.ts`, in two parts:

- `fetchMoneyInputs(token, xvmApiVenueId, period, now)` does the I/O: events through `listEventsInRange`, revenue rows through `listFinanceTransactions` in 60-day chunks (service names come on the row, no services call), paid payroll through `listPayrollChunked`.
- `buildMoneyAnalytics(inputs, period)` is pure and returns the fields above.

Call count for 30 days: 1 to 2 event windows, 1 to 2 transaction chunks, 1 to 2 payroll chunks. For "all": about 7 of each. Revenue per event comes from grouping rows by `event_id`, not one call per event.

The route calls both, merges the result with the Prisma door fields, and returns the same response shape. `lib/financial-calculations.ts` has no other caller and is deleted.

## Files

- Create `lib/api/analytics-money.ts` and `analytics-money.test.ts`
- Modify `app/api/venues/[venueId]/analytics/route.ts`
- Modify `app/dashboard/[slug]/analytics/page.tsx`: show the 409 message instead of the raw code
- Delete `lib/financial-calculations.ts`

## Verification

- Unit tests on `buildMoneyAnalytics`: pending and voided excluded, expenses and payouts excluded, rows with no event still count for services and average spend, the payroll overlap rule including the multi-event case, top 5 services, financial span, empty input.
- Route test: 401, 503, 409, and the happy path with xvm-api mocked.
- Knock-outs: drop the posted filter, drop the payroll overlap, each failing a test.
- `tsc`, lint, full vitest.
- Live check on dev: the analytics page against Test-Venue, comparing the per-event revenue to the event detail page for the same events.
