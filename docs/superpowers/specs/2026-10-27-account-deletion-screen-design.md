# Account deletion screen

Builds the dashboard side of xiv-venue-manager/xvm-api#217 (`DELETE /me`). Depends on #217 being deployed, and on xvm-dashboard#284 so a fresh sign-in can cancel a pending deletion.

## Why

The Danger zone card on Account Settings deletes the person with `prisma.user.delete` through `DELETE /api/user/account`. It skips xvm-api, so there is no grace period, no check for unpaid payroll or a last owner, and no venue role ends. Its copy ("all your venues, events, sales and staff data will be removed") is also wrong: venue records stay, the person is anonymised after 30 days.

## Decisions

- The Prisma user row is left alone. NextAuth's adapter needs it until the adapter swap, which is the last step of the Prisma removal. Deleting it now would add a transitional rule and break the 30 day cancel.
- The old `app/api/user/account/route.ts` is removed. Its only caller is the settings page.
- The refusal text from xvm-api (a plain `detail` string that names the venues) is shown as is. Parsing it would need an API change.
- The confirmation stays the existing two-click AlertDialog. Deletion is undone by signing in again, so a typed confirmation adds friction for little protection.

## Server

`requestAccountDeletion(personToken)` in `lib/api/xvm-api.ts` calls `DELETE /me` and returns `{ requested_at, anonymises_at }`.

`DELETE /api/user/deletion`:

1. No session: 401.
2. No usable stored xvm-api token (`getValidXvmApiToken` returns null): 503 with "xvm-api link not established yet. Sign out and back in, then try again.", as the other routes do. It does not re-mint, because an unflagged exchange is not a sign-in.
3. Calls `requestAccountDeletion`. A failure goes through `xvmApiErrorResponse`, which passes a 409 (unpaid payroll, last owner) through with its message and treats a 401 as an expired link.
4. On success it calls `invalidateXvmApiCredential` (the API has already revoked the credential) and returns `{ anonymisesAt }`.

It writes nothing to Prisma beyond that credential row.

## Screen

The Danger zone card on `account/settings/page.tsx` keeps its place and style. The copy states what happens: roles at every venue end now, sign-in is revoked, the account is anonymised after 30 days, and signing in again before then cancels the deletion while the roles stay ended. The action button reads "Delete my account".

Dialog states:

- **Idle:** the confirmation text and Cancel / Delete my account.
- **Refused (409):** the API's text appears in the dialog, which stays open.
- **Accepted:** the dialog closes and the Danger zone card itself shows "Scheduled for deletion on <date>. Sign in again before then to cancel." with a Sign out button that calls `signOut({ callbackUrl: "/" })`. The card, not the dialog, holds the message so it survives the dialog being dismissed.
- **Other failure (503):** a generic error in the dialog, which stays open.

## Tests

Route tests: no session gives 401; no stored token gives 409 and makes no API call; a 409 from xvm-api is passed through with its message; success drops the credential; `prisma.user.delete` is never called. The `xvm-api.ts` helper gets a request-shape test. Then `tsc`, eslint, the full vitest run, and a live check against a local xvm-api at the #217 head: request, 409 path (an owner of an active venue), accepted state, and cancel by signing in again.

## Out of scope

Cleaning up the Prisma user row, which is part of the final Prisma removal. A landing-page notice after sign-out. Showing a pending-deletion banner on sign-in.
