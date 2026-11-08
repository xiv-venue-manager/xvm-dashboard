# Character verification with XIV Auth

Status: design, agreed 2026-11-07, revised 2026-11-08 (see Revision). Ships after the Prisma to xvm-api cutover.

## Revision 2026-11-08: venue-scoped, like the Lodestone check

xvm-api #259 added Lodestone verification with bot-only routes under a venue. To keep the two verifications consistent, XIV Auth follows the same scoping and the same account rules. The "Units" and "Rules" sections below still describe the proof and the takeover rules. These parts change:

- **Entry.** The bot's Verify button sends the member to the dashboard's `/verify?guild=<id>`. There is no Verify button on the account characters page, which only shows the Verified mark for either method.
- **Route.** The dashboard records the proof with a venue-scoped route, `POST /venues/{venue_id}/verification/xivauth`, using the dashboard's service credential and naming the person. It replaces `POST /internal/characters/verified`. A person's own credential and the bot's are refused.
- **Venue setting.** The venue's verification method gains an XIV Auth option next to Off, Character exists and Code in bio. This edits #259's `LodestoneCheck` enum and its CHECKs, so it is raised with Allegro on that PR before it is built.
- **Same account rules.** The proof lands through the same `CharacterService.verify` as the Lodestone check: a verified claim takes a character from an unverified holder and never from a verified one, and a character is found by Lodestone id first. XIV Auth adds `xivauth_key` and batches several characters.
- **Same limits.** The per-venue rate limit applies. The role, nickname and notifications stay with the bot.
- **Order.** Nothing is pushed until #259 has merged. The xvm-api branch is then rebased on it, and the dashboard contract copy is refreshed from merged xvm-api.

## Goal

A person can prove they own an FFXIV character, and xvm-api records that proof. One proof serves two doors:

- **Account linking.** A character in a person's list is shown as verified, and a verified claim beats a self-declared one. This closes the lockout in xvm-api issue #209, where a character is first come first served and its real owner cannot link it.
- **Discord member verification.** A server's member proves a character and the bot grants a verified role. The bot's part is a button that opens the same dashboard page, plus a role grant through the existing role outbox. That part is Allegro's and comes later.

Decisions made while designing this:

- **Conflicts.** A verified claim takes a character from an unverified holder. It never takes one from another verified holder.
- **What verification gates.** Nothing yet. Verified is a mark that wins conflicts and is shown in the dashboard, plugin and bot. A venue setting that requires it can be added later without changing the stored proof.
- **Mechanism.** The dashboard relays XIV Auth's character list to xvm-api. Signed attestation JWTs are a possible hardening later.
- **Scope of the work.** We build the proof and account linking. Allegro adds the per-venue verified role and the bot button afterwards.

## What XIV Auth provides

From XIV Auth's documentation (a Notion site, marked work in progress) and the open source `omniauth-xivauth` gem:

- Authorization code flow with PKCE (S256 only). A client secret or PKCE is required. Endpoints are `https://xivauth.net/oauth/authorize` and `https://xivauth.net/oauth/token`. The API is at `https://xivauth.net/api/v1`.
- Redirect URIs must be registered in the developer portal and be HTTPS or localhost. A client must be registered first, and some scopes may need an access review.
- Scopes used here: `character:all`. Related scopes: `character` (one character), `character:jwt` (signed ownership attestation), `refresh`, `user`.
- Access tokens last 120 minutes, authorization codes 10 minutes. There is no token introspection.
- `GET /characters` returns, per character: `persistent_key`, `lodestone_id` (a string), `name`, `home_world`, `data_center`, `avatar_url`, `portrait_url`, `created_at`, `verified_at`, `updated_at`.
- The user chooses which characters to share. If they share none or have none verified, the flow ends and the relying party is not told.
- XIV Auth does not scrape the Lodestone and does not describe how it verifies ownership. It offers "authoritative validation that a character is verified".

Not confirmed: whether a scope needs an access review for us, whether two XIV Auth accounts can verify the same character, and the claims inside an attestation JWT (the notes are unfinished).

## Design

### Units

1. **Dashboard flow** (apps/web, ours). A "Verify with XIV Auth" button on `/dashboard/account/characters`.
   - `GET /api/xivauth/start`: for a signed-in person, creates `state` and a PKCE verifier, keeps them in a 10 minute httpOnly cookie, and redirects to XIV Auth asking only for `character:all`. No `user`, email or `refresh` scope.
   - `GET /api/xivauth/callback`: checks `state`, exchanges the code, calls `GET /characters`, forwards the list to xvm-api and shows the result. Everything is server side, so the content security policy is unchanged.
   - New server-only settings: `XIVAUTH_CLIENT_ID` and `XIVAUTH_CLIENT_SECRET`. The redirect URI is built from the site's own URL.
2. **xvm-api endpoint** (Allegro's repo, our change). `POST /internal/characters/verified`, callable only with the dashboard service credential, taking a person id and a list of characters. A person's own credential must be refused, or they could forge a verified claim. It returns one outcome per character.
3. **Bot door** (Allegro, later). The bot's Verify button opens `/verify?guild=<id>` on the dashboard, which signs in with Discord and runs the same flow. When xvm-api records a proof for someone in that server, it queues the verified-role grant for the venue.

### Data

`person_characters` already has `lodestone_id`, `verified_via` and `verified_at`, none used by any route. Changes:

- Add `xivauth_key` (XIV Auth's `persistent_key`), unique where set.
- Add a unique index on `lodestone_id` where set. Before creating it, check the loaded data for duplicates.
- Add the `verified_via` value `xivauth`.
- Store no tokens.

### Rules when a proof arrives

A character is matched by `lodestone_id` first (names and worlds change), then by name and world as the existing index does.

1. **Nobody holds it.** Create it for the person, marked verified. It is their primary if it is their first.
2. **They already hold it.** Mark it verified and refresh the name, world, `lodestone_id`, `xivauth_key` and `verified_at`. This is how renames and world transfers are picked up.
3. **Someone else holds it, unverified** (self-declared or manual). Move it to the person who proved it. The old holder's primary passes to their oldest remaining character, as in today's unlink. Log it naming both people and the character, and notify the old holder.
4. **Someone else holds it, verified.** Do not move it. The outcome is `conflict`, logged for an admin, and the person is told it is already verified by another account.

The person and any displaced holder are locked in id order. Repeating a proof changes only `verified_at`. Input limits: name and world at most 32 characters, `lodestone_id` parsed to a number, at most 100 characters per request.

### Errors

- The dashboard handles XIV Auth's own failures: the user denies access, shares nothing, the `state` does not match, or the code has expired. Each shows a clear message and a retry.
- xvm-api answers a bad payload with a 4xx and a good one with per-character outcomes, so one failure does not hide the rest.

### Known limits

- A proof is a snapshot. If a user later removes or unverifies a character at XIV Auth, we are not told. Running the flow again refreshes it.
- Existing characters stay self-declared until their owners verify. There is no data migration.
- A verified character renamed into a name that someone else has self-declared is a `conflict`, not a transfer. The unverified holder of the name is not displaced. Add displacement later if it happens in practice.

## Rollout

- Register the XIV Auth OAuth client now, with redirect URIs for production, the dev site and localhost. An access review could take longer than the build.
- Build on dev. Ship after the cutover on 2026-11-10, not inside the window.
- The plugin shows the verified badge once `verified_via` is in its character response (the plugin release is parked).

## Testing

- **xvm-api:** the four rules, idempotency, concurrent proofs, input limits, and refusing a person's own credential.
- **Dashboard:** the two routes with XIV Auth mocked (success, denied, no characters, state mismatch, expired code), and the contract drift check covers the new endpoint.
- **Manual:** one run with a real XIV Auth account on the dev site once the client is approved.

## Open questions

- Does any scope we need require an access review, and how long does it take?
- Can two XIV Auth accounts verify the same character?
- Which per-venue setting holds the verified role, and does Allegro want it to apply on verify only or also remove on unverify?

## Out of scope

Requiring verification anywhere, signed attestation JWTs, the device flow, the in-game XIV Auth plugin, and any bot work.
