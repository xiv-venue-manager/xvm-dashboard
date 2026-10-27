# End the dashboard session when the account is being deleted

Review change on xvm-dashboard#286. Builds on #284 (`fresh_sign_in`) and needs xvm-api#217, which is on xvm-api's dev deploy.

## Why

xvm-api revokes every credential when an account deletion is accepted, and refuses the dashboard's refresh exchange with a 409 until the person signs in again. The dashboard does not follow. Its next-auth sessions are JWTs, so every session that was not signed out stays signed in:

- The refresh branch in `lib/auth.ts` catches the 409, logs it and returns the token unchanged, so each page load fires more exchanges that all 409.
- Venue pages land on their error page and the rest render without their data.
- Nothing tells the person why, or that signing in again is the one way to cancel the deletion.

The delete dialog says "you are signed out everywhere". That is true of xvm-api, not of the dashboard.

## Decisions

- A marker on the token, not a throw from the `jwt` callback. A throw would also end the session, but it logs an error for an expected state, depends on next-auth's error path, and leaves the sign-in page unable to say why.
- Any 409 from the refresh exchange ends the session. xvm-api has two there: a pending deletion ("scheduled for deletion") and an account the anonymiser already deleted, which only a sign-in racing the anonymiser meets. Both mean this session cannot continue, so one marker and one message cover them.
- The tab that deletes the account signs out at once, like every other session. The scheduled-date card from #286 goes. The date is only known in that tab, so a message that works for every session cannot carry it.
- Only the refresh branch can see the 409. The real sign-in sends `fresh_sign_in` and cancels the deletion instead.

## Facts about next-auth 4.24.15 that the design rests on

- The session route runs the `jwt` callback on every session read and re-issues the cookie from its result.
- A server-rendered page calls `getServerSession()` with a no-op `setCookie`, so a change made to the token during a render is dropped. The client's fetch of `/api/auth/session`, made by `SessionProvider`, is what writes the marker into the cookie.
- `proxy.ts` uses `getToken`, which only decodes the cookie, so it sees the marker only after that first client fetch.

## Server: `lib/auth.ts`, `types/next-auth.d.ts`

- In the refresh branch, a 409 `XvmApiError` from `exchangeToken` sets `token.deletionPending = true`. Any other error stays logged and non-fatal, so xvm-api being down still never fails a login.
- While `token.deletionPending` is set the refresh branch skips the exchange.
- The sign-in branch is unchanged. A fresh sign-in builds a new token, so the marker is gone.
- The `session` callback sets `session.deletionPending` from the token. `JWT` and `Session` gain `deletionPending?: boolean`.

## Browser: `components/session-provider.tsx`

A child of the next-auth provider reads `useSession()`. When `deletionPending` is true it calls `signOut({ callbackUrl: "/auth/signin?reason=deletion" })`, once.

## Server-rendered pages: `proxy.ts`

For a non-public path, a marked token is treated like a missing one. It redirects to `/auth/signin` with `reason=deletion` and the existing `callbackUrl`.

## Telling the person: `app/auth/signin/page.tsx`

With `?reason=deletion` the page shows a notice: "Your session ended because this account is scheduled for deletion or was deleted. Signing in again cancels a pending deletion." A pure helper in `lib/` maps the reason code to the message, so it is unit-tested without jsdom. An unknown reason shows nothing.

## The deleting tab: `app/dashboard/account/settings/page.tsx` (#286)

On a `scheduled` outcome the page calls `signOut` to the same sign-in URL. The scheduled card, its state and the date formatting go. The route keeps returning `anonymisesAt`; the page just stops showing it.

## Tests

Unit, in `lib/auth.test.ts`:
- A 409 from the refresh exchange sets the marker.
- A non-409 error does not.
- A marked token does not call the exchange.
- A real sign-in token carries no marker, and the session exposes the flag.

Unit, for the reason helper: the known code, an unknown code, and no code.

There is no jsdom, so the provider watcher, the proxy redirect and the sign-in notice are checked live. "Another session" is reproduced by setting `deletion_requested_at` in xvm-api's database, revoking the credential and clearing the stored one, then reloading in Chrome. Then `tsc`, eslint and the full vitest run.

## Out of scope

Telling a pending deletion from a completed one on the sign-in page, ending sessions on other devices without a request from them (they end on their next page load), and the pending-deletion banner after sign-in.
