# Contests dashboard design

Manager-facing web dashboard integration for xvm-api's contests feature (giveaways + raffles, xvm-api PR #84, merged into `dev`). Bot-side entry UI (Discord buttons) is out of scope — that's separate work.

## Context

xvm-api now exposes giveaways and raffles: managers create a draw, people enter (keyed by Discord snowflake, no XVM account required), a manager rolls winners once. No dashboard or bot consumer exists yet for this API surface.

Key API facts this design relies on:
- `GiveawayRow` / `RaffleRow`: `id, name, prize|cost_per_ticket+winner_basis_points, num_winners, auto_notify, entry_count[+ticket_count, pot], rolled_at, rolled_by_person_id, created_at`
- `EntryRow`: `discord_user_id (Snowflake), entered_at, ticket_count (raffle), won_at, winner_rank`
- Entries carry **only** a Discord snowflake — no username.
- View endpoints (list, get, entries) are readable by any venue member.
- Create/update/delete/roll require `MembershipTier.Manager`.
- Raffle `credit_tickets`/`refund_tickets` are documented "Any member" in the API, but this design gates them to Manager+ in the UI since they're money-adjacent.
- Roll is irreversible (409 on re-roll, no force flag).

## Architecture & file layout

Follows the existing `Rooms`/`Shifts` three-layer convention: server page → Next.js API proxy route (holds `personToken`, session-gated) → `lib/api/xvm-api.ts` client → xvm-api backend.

```
app/dashboard/[slug]/services/contests/
  page.tsx                    — server component: session+venue guard, fetches list, renders board

components/
  contests-board.tsx           — client board: card grid, create modal trigger, roll confirm
  contest-form-dialog.tsx      — create/edit modal (shared between giveaway/raffle, type toggle)
  contest-entries-drawer.tsx   — entries slide-over: table, credit/refund, winner ranks
  ui/sheet.tsx                 — new shadcn Sheet primitive (doesn't exist in this codebase yet)

app/api/venues/[venueId]/contests/
  giveaways/route.ts                              — GET list, POST create
  giveaways/[id]/route.ts                         — PATCH update, DELETE
  giveaways/[id]/entries/route.ts                 — GET entries
  giveaways/[id]/roll/route.ts                    — POST roll
  raffles/route.ts                                — GET list, POST create
  raffles/[id]/route.ts                           — PATCH update, DELETE
  raffles/[id]/entries/route.ts                   — GET entries
  raffles/[id]/entries/[discordUserId]/route.ts    — PUT credit, DELETE refund
  raffles/[id]/roll/route.ts                       — POST roll

lib/api/xvm-api.ts   — add listGiveaways/createGiveaway/updateGiveaway/deleteGiveaway/
                        listGiveawayEntries/rollGiveaway/listRaffles/createRaffle/
                        updateRaffle/deleteRaffle/listRaffleEntries/creditTickets/
                        refundTickets/rollRaffle
```

Sidebar: one new entry, `Contests`, placed directly after `Services` in the `Operations` group of `components/venue-sidebar.tsx`. Not a tab inside `services/page.tsx` (that file is already 892 lines of unrelated menu/category CRUD) — own route keeps each file focused and gives deep-linkable URLs.

## Pages & components

### `ContestsBoard` (list)

Card grid, one card per giveaway/raffle (not a table — chosen over the table layout for more visual room and because there are typically only a handful of active contests at once):

- Type badge (Giveaway/Raffle, distinct colors), status dot (Open/Rolled), name, prize (giveaway) or pot + cost-per-ticket (raffle), entry/ticket count
- Click card → opens `ContestEntriesDrawer` (any member can view)
- "Roll" button on open contests, Manager+ only — hidden entirely for non-managers (not shown-disabled), matching how Rooms hides its manage actions
- Rolled contests show winner name(s) inline on the card instead of just a status dot
- "+ New Contest" button (Manager+) opens `ContestFormDialog` in create mode
- Empty/disconnected state matches Rooms' `notConnected` pattern (`!venue.xvmApiVenueId`)

### `ContestFormDialog` (create/edit)

Modal dialog (matches `create-shift-dialog.tsx` convention, not a dedicated page). A Giveaway/Raffle type toggle at the top switches the field set:
- Shared: `name`, `end_at`, `num_winners`, `auto_notify`
- Giveaway only: `prize`, `thumbnail_url`, `color`, `emoji`, `description`
- Raffle only: `cost_per_ticket`, `winner_basis_points`

### `ContestEntriesDrawer` (entries)

New `Sheet`-based slide-over from the right (new shadcn primitive — this codebase only has `Dialog`/`AlertDialog` today; adding `Sheet` is a one-time, reusable addition, chosen over reusing `Dialog` because a scannable entries table fits a drawer better than a centered modal).

- Table: entrant (resolved name or truncated Discord ID + copy button), `entered_at`, ticket count (raffle only), winner rank (post-roll, sorted first — matches the API's own ordering)
- Name resolution: batch all of the drawer's `discord_user_id`s against `User.discordId` in **one** Prisma query when the drawer opens (not per-row); show the linked display name on match, a truncated Discord ID with a copy button otherwise. No new Discord API integration — reuses the existing linked-account mapping already used by `lib/shift-bot.ts`.
- Manager+ only: inline "Credit" (+N tickets, raffle only, small inline quantity input) and "Refund"/"Remove" actions per row; both disabled once `rolled_at` is set (mirrors the API's 409). Not rendered at all for non-managers.

## Roll flow

1. Manager clicks "Roll" on an open card.
2. `AlertDialog` confirms: *"Roll 1 winner from 34 entries? This cannot be undone."* — count comes from the card's already-loaded `entry_count`, no extra fetch.
3. On confirm: `POST .../roll`. On success, the card updates in place to "Rolled", showing the resolved winner name(s) inline, and a `sonner` toast fires ("Winner rolled: <name>").
4. On 409 (someone else rolled concurrently — expected/legitimate per the API's own conditional-UPDATE design): toast error, silently refresh the card from the list rather than a scary error dialog.

## Permissions & error handling

- Mirrors the API's own tiering: view (list, get, entries) = any venue member; create/edit/delete/roll/credit/refund = Manager+ — gated by hiding the UI affordance (as Rooms does with `canManage`) with the API's 403 as the real backstop.
- `notConnected` and `isXvmAuthFailure` handling copy the Rooms page's existing pattern exactly, including the `invalidateXvmApiCredential` call on auth failure.
- 404 on a stale card (contest deleted elsewhere) → toast, remove the card from local state rather than a full page reload.

## Testing

- `lib/api/xvm-api.test.ts` gets new cases for the contest client functions (request shape, error mapping), following the existing `transactions.test.ts` pattern.
- No new component-test infra introduced — `Rooms`/`Services` have no `.test.tsx` today either, so this stays consistent with what's already in the codebase.

## Out of scope

- Discord bot entry/withdraw button UX (Allegro's work).
- Any xvm-api schema or contract changes.
- Resolving entrant names via a live Discord API call — deferred; linked-account fallback covers the common case at zero new infra cost.
