# Discord pickers: user, channel, role, emoji

Status: proposed, 2026-10-07. Nothing built yet.

## Why

Every place the dashboard needs a Discord id today asks a human to paste a snowflake:

| Where | What it asks for |
|---|---|
| `dashboard/[slug]/settings/page.tsx:1404` | "Discord Channel ID", with a hint to turn on Developer Mode |
| `components/apply-template-dialog.tsx:127` | "Channel ID", validated as numeric |
| `components/reaction-role-panels-board.tsx:241` | "Enter the Discord channel ID to post this panel to" |
| `components/reaction-role-panel-form-dialog.tsx:238` | "Role ID", validated as numeric |

Numeric-only validation is the whole of it. A wrong-but-numeric id saves happily and fails later in the bot, where the person who typed it never sees the error.

## What already exists

This is mostly a port, not a build. Two separate discoveries:

**1. `apps/web/lib/discord-rest.ts` is already here and wired into nothing.** Its own header says so — "Ported from FroggeBot Dashboard as a resource drop — NOT wired into anything yet." It is 392 lines of battle-tested Frogge code and it already contains everything the server side of all four pickers needs:

- `getGuildRoles` — sorted highest-position-first, matching Discord's own role UI
- `getGuildChannels` — full display-order reconstruction (categories, positions, id tie-break), filtered to postable text types
- `getGuildEmojis`
- `searchGuildMembers` — prefix search, capped at 10, deduped because Discord has been seen returning a member twice for one query
- `getGuildMembers(guildId, userIds)` — resolve known ids to names and avatars for *rendering*, batched at concurrency 10
- `getGuildPresence` — guild icon and whether the bot is even in the guild, in one request
- `unsafeRoleReason` + `filterAssignableRoles` — keeps `@everyone`, managed and Administrator roles out of pickers, with `alwaysInclude` for the already-saved value

The comments document real production incidents and are the reason to port rather than rewrite. Two worth reading before touching it: the one at line 110 about silent failures making every picker degrade invisibly, and the one at line 183 about an uncontrolled `<select>` whose saved value is not among its options silently overwriting that value.

**2. The user picker is already here too, also unwired.** `apps/web/components/`, both dated 31 Aug, both importing `lib/discord-rest`, and nothing imports *them*:

| Already in XVM | Lines |
|---|---|
| `user-picker.tsx` | 242 |
| `picker-field.tsx` | 99 |

**3. Only the emoji picker is still Frogge-only.** `FroggeBot/Dashboard/src/`:

| Still to port | Lines |
|---|---|
| `components/EmojiPicker.tsx` | 254 |
| `components/EmojiGlyph.tsx` | 15 |
| `lib/emoji.ts` | 66 |

Neither side has a role or channel picker component. In Frogge those are plain selects built inline in 10+ pages, each calling `getGuildRoles`/`getGuildChannels` itself. So role and channel pickers are the only genuinely new components — and they are the easy two.

Net: of the four pickers, one is written and unwired, two are small and new, and one is a port with a dependency pair.

## Three corrections to assumptions

**Twemoji: yes, and the pairing matters.** Frogge uses `@twemoji/api` ^17.0.3 **with** `unicode-emoji-json` ^0.9.0. The second is the catalogue (what emoji exist, their names, their groups); Twemoji only renders a codepoint to an image. A picker needs both.

**No privileged intent is needed.** I assumed a user picker would need the `GUILD_MEMBERS` privileged intent, because the bot runs on `Intents.default()` (`Bot/src/bot/core.py:16`), which excludes it. That assumption was wrong, and `discord-rest.ts:301` says why: `GET /guilds/{id}/members/search` is not intent-gated — only the plural `/members` list endpoint and gateway member events are. So the user picker must be a **search** picker, never an enumerate-all one. That is also the right shape for a guild with thousands of members.

**Caching is ours to add, not to port.** Frogge's `api/guilds/[guildId]/emojis/route.ts` calls Discord on every single request with no cache at all. So caching is a genuine improvement over the original rather than part of the port — and this dashboard already has the Redis layer Frogge lacked (`lib/redis-cache.ts`: `getOrSet`, `cacheKeys`, `cacheTTL`).

## Decided: one bot, Frogge's

Settled 2026-10-07. One group of users has to install the other bot either way, so there is no point running two — pick one and remove the other entirely. Frogge's is the one, because **Frogge is in far more guilds**, and the install burden falls on whichever side loses.

Briefly reconsidered on the belief that changing the OAuth client would break existing sign-ins. It does not — see below — so the decision stands on the guild count alone.

The in-channel cost is **accepted, not mitigated**: XVM's existing shift embeds stop working when its application stops owning them, and that is covered by a migration announcement at deploy rather than by a repost pass. `api/cron/sync-shift-embeds` exists if reposting turns out to be wanted after all.

**The pickers do not wait for the removal.** They need a token that can read the venue's guild. Pointing `discord-rest.ts:19` at the winning bot's token is forward-compatible with the end state and nothing has to be deleted first, so PR 1 can proceed on that alone. Everything below is a separate project that the pickers merely inherit.

### What is bound to a Discord application, and therefore moves

| Bound to the application | Where |
|---|---|
| Bot token — posts and edits shift embeds | `DISCORD_BOT_TOKEN`, via `lib/discord-bot.ts` into `lib/shift-bot.ts` |
| Interaction signature key | `DISCORD_PUBLIC_KEY`, `api/discord/interactions/route.ts:5` |
| Interaction endpoint URL | registered in the Developer Portal, not in this repo |
| OAuth sign-in client | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` |
| The "install the bot" invite link | `NEXT_PUBLIC_DISCORD_APPLICATION_ID`, `dashboard/[slug]/settings/page.tsx:1415` |
| Slash commands | registered per application by the bot at startup |

Two of those are sharper than the rest.

**Already-posted shift embeds go dead — accepted.** Interaction delivery is per-application: Discord sends a button press to the application that owns the message. Every shift embed already in a channel belongs to the old application, so after the switch its accept/decline/maybe buttons route to an endpoint this app no longer serves, and could not be verified if they arrived, since the public key changed too. Taken as a known side effect of the migration and announced, not repaired.

**Sign-in survives the OAuth client change — verified, not assumed.** `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are per-application, but nothing identity-bearing hangs off the application:

- `Account` is keyed `@@unique([provider, providerAccountId])` (`prisma/schema.prisma:129`), and `providerAccountId` is the Discord **user id** — the same value whichever application asked, because it identifies the human.
- The xvm-api side resolves the person the same way: `exchangeToken(account.providerAccountId, ...)` at `lib/auth.ts:61`.
- `lib/auth.ts:50` persists `account.access_token` onto the JWT and **nothing reads it back** anywhere in the app, so invalidating it costs nothing.

So the cost is: register the redirect URI on the surviving application, and every user sees the consent screen once more. No relinking and no data migration.

**One sequencing constraint remains.** #123 is an open sign-in failure right now. Move the OAuth client only after it is fixed and sign-in is confirmed healthy — otherwise the two failures are indistinguishable and neither can be diagnosed.

**Out of scope, but worth naming:** the eorzea-bot is a *third* application (`EORZEA_BOT_TOKEN`, `EORZEA_BOT_CLIENT_ID`) and this decision says nothing about it.

### What follows for the pickers

The pickers only work in guilds the surviving bot is in, so during the transition an XVM-only venue has no roles, channels, emoji or member search at all. `getGuildPresence` distinguishes "no bot here" from "we could not ask" and only claims absence on a definitive 404, so the UI can say "the bot isn't in this server" with an invite link rather than falling back silently to a paste-an-id box. That state is the normal case mid-migration, not an edge case, which is what makes point 3 under Open questions load-bearing.

## Where the venue's guild id comes from

Answered: xvm-api already models it, as an **external link** rather than a column.

- `Provider.DiscordGuild = "DiscordGuild"` (`enums.py:34`), alongside `FFXIVVenues` and `Partake`
- `VenueExternalLinkModel` carries `provider` and `external_id`, so the guild snowflake is the `external_id` of a `DiscordGuild` link (`models/venues.py:64`)
- Readable from the venue detail endpoint, which returns "the full profile, gallery and external links included" (`routers/venues.py:89`), and writable via `POST /venues/{venue_id}/links` (`:161`)

Not `discord_settings` — that router is only a read/write of stored settings, with no guild id of its own.

**The caveat, and it is the usual one.** Prisma's `Venue` still has `discordServerId`, commented "Discord Integration (deprecated - kept for migration)". So the question PR 1 has to answer first is not *where* the id lives but *whether it is populated*: if venues are linked only through the deprecated Prisma field and not as `DiscordGuild` links in xvm-api, there is a backfill before any picker works — the same shape as the backfills in #120 and #124. Worth one query against dev before starting:

```sql
SELECT COUNT(*) FROM venue_external_links WHERE provider = 'DiscordGuild';
```

against the count of Prisma venues with a non-null `discordServerId`.

## Why not one big PR

One PR for all four means one review covering a REST wiring decision, a Redis caching policy, two ported components, two new components, a new npm dependency pair, and 10+ call sites. The caching policy alone deserves its own argument, because the four resources want four different answers.

Six PRs, each independently useful and each landable without the next. PR 0 was not in the first draft of this plan — it exists because the venue-to-guild link turned out not to exist at all:

### PR 0 — Connect a venue to its Discord server

**This is the real first step, and it is not a picker.** Nothing today records which Discord server a venue belongs to. Verified by exhaustion:

| Path | What it does |
|---|---|
| The invite link, `settings/page.tsx:1415` | `?client_id=...&scope=bot&permissions=274877908992` — no `redirect_uri`, no `state`, no `response_type`. The bot joins and the user lands on Discord's own page. Nothing comes back |
| A bot-install callback route | Does not exist |
| The bot on `on_guild_join` | No handler |
| The bot writing a link | Read-only: `GET /venues/by-link/DiscordGuild/{guild_id}` in `client/venues.py:23` and `client/_core.py:53` |
| Venue creation | No guild or Discord field at all |
| `VenueDiscordSettingsModel` | `venue_id`, three channel ids, `updated_at`. No guild id |
| Prisma `Venue.discordServerId` | Nothing writes it. Schema line only, marked deprecated |
| `POST /venues/{venue_id}/links` | Works, and the dashboard never calls it |

The only writers of a `DiscordGuild` link are `scripts/seed/venues.py:32` and `scripts/seed_venue.py --guild-id`, both run by hand. So in production the link almost certainly does not exist for any real venue, and that is why the counts are not worth running: there is nothing to count and nothing to back-fill *from*.

**Independent payoff:** the bot already resolves a guild to a venue through `by-link/DiscordGuild/{guild_id}`, so every bot feature keyed on "which venue is this server?" currently only works for hand-seeded venues. PR 0 fixes that whether or not the pickers ever land.

**The flow.** Give the existing invite link a `redirect_uri` and a `state`, and add the callback that is missing. Discord appends `guild_id` to the redirect after the install, so the server the owner picked comes back without us listing anything — Discord's own picker already shows only servers where they have Manage Server, which is exactly the right filter. The callback then writes the link through `POST /venues/{venue_id}/links` with `provider: DiscordGuild`.

Worth confirming the exact parameter set against Discord's current docs before building — `response_type=code` with `scope=bot` is the documented shape, and the callback carries `code`, `guild_id`, `permissions` and `state`. I have been wrong twice this week asserting a mechanism from something adjacent to it, so check rather than take this paragraph's word for it.

**The security work is the substance here, not the redirect.**

- **`state` must be verified, not merely sent.** It has to bind the callback to both the signed-in user and the venue they started from. Without that, a replayed callback links an attacker's guild to someone else's venue, or their guild to an attacker's venue. This is the one genuine hole in the flow and everything else is bookkeeping.

  **Decided 2026-10-07: Redis `setex`, deleted on read.** Write a random nonce holding `{ userId, venueId }` with a short TTL when the owner clicks through; the callback reads it, deletes it, and checks the `userId` against the live session. Single-use, expiry is Redis's problem, no schema and no cleanup job — which also matters because the alternative was a Prisma table in a database being retired. A signed stateless `state` would have worked but gives up single-use for no saving, since Redis is already in the request path.

  **This has to fail closed, and that is a departure from everything around it.** Use `redis` and `ready()` from `lib/redis.ts` directly. Do **not** reach for `lib/redis-cache.ts`: its own docstring says "Fail-open: any Redis error returns null/no-op so a cache outage degrades to direct DB hits, never to a 500" — correct for a cache, wrong here, because `getCached` returning `null` during a Redis blip is indistinguishable from "that state was never issued". If the callback reads a missing state as permission to proceed, a Redis outage silently turns the CSRF protection off.

  Both existing direct users of Redis degrade rather than refuse — `redis-cache.ts` fails open, and `rate-limit.ts` falls back to an in-memory limiter with "Redis blip should not take the plugin offline" as its stated reason. So this is the first place in the codebase where an outage must **refuse the request**, and the surrounding code teaches the opposite habit. An in-memory fallback is specifically not available: the state is written by whichever instance started the flow and the callback may land on another.
- **Owner only**, server-side on the callback — the same check `api/venues/[venueId]/xvm-connect/route.ts:31` already makes.
- **One venue per guild is enforced upstream.** `seed_venue`'s own help says "a guild already linked elsewhere refuses the whole seed", so xvm-api rejects a duplicate. The callback has to turn that into a sentence an owner can act on, not a 500.
- **Confirm the bot actually arrived.** `getGuildPresence` already answers it, and it catches an owner who abandoned the authorize screen at the last step — otherwise the link is written for a guild with no bot in it, which is the state every picker then degrades on.
- **Do not write Prisma's `discordServerId`.** It is deprecated and unread; feeding it would create the only data anyone has ever put there.

**Permissions: Administrator, set in the Developer Portal.** Decided 2026-10-07.

The invite link currently hardcodes `permissions=274877908992` — bits 11 and 38, Send Messages plus one more, and notably *not* bit 10, View Channel. Frogge's own invite carries no `permissions` or `scope` at all:

```
https://discord.com/oauth2/authorize?client_id=1224902245821321338
```

With both omitted, Discord uses the application's **Default Install Settings** from the Developer Portal. So Frogge's permissions already live there, and the guilds that invited Frogge granted whatever is configured there.

**So PR 0 drops the hardcoded integer** from `settings/page.tsx:1415` and matches Frogge's shape. One source of truth, changeable without a deploy, and it removes an integer that is already wrong. Administrator is then a portal setting, not a code constant.

Administrator settles the channel-visibility question outright: it bypasses channel permission overwrites, so the bot sees and can post to every channel, and `GET /guilds/{id}/channels` has nothing to filter.

**It does not bypass role hierarchy, and that catches people out.** A bot with Administrator still cannot manage a role positioned above its own highest role. `grantRole` and `revokeRole` in `discord-rest.ts`, and everything behind `RoleSyncService`, still need the bot's role dragged above the roles it assigns. That is the most common cause of "the bot is not handing out roles" and the one Administrator is most often assumed to fix. Setup guidance has to say "invite the bot **and** move its role up" regardless of the permission set.

### PR 1 — Wire the REST layer and the cache

**Shipped as #157.** No UI. Four read-only route handlers under
`app/api/venues/[venueId]/discord/`: `roles`, `channels`, `emojis`, and `members`
(`?q=` searches, `?ids=` resolves), each returning the shaped types `discord-rest.ts`
already defines.

Keyed by **venue** id, not by guild id as this plan first said. The gate needs a venue,
the client always knows the venue and may not know the guild, and keying by guild would
need a `GET /venues/by-link/DiscordGuild/{id}` reverse lookup that nothing else uses —
while the manifest has all 84 venue routes being re-keyed to the xvm-api venue id
anyway. There is no cache sharing to win either, because `UniqueConstraint("provider",
"external_id")` means one guild maps to at most one venue.

`requireVenueGuild` in `lib/api/venue-guild.ts` is the gate all four share. It
establishes four things before any Discord call — the caller works at this venue, the
venue exists in xvm-api, we hold a person token, and a Discord server is linked — and
answers each failure with its own status, because a picker has to tell "you cannot see
this" from "nothing is connected yet" from "try again". Collapsing them is how an
integration ends up looking like a deliberate empty state. STAFF, not MANAGER: these
are option lists, and what a person may then save is enforced by the route that takes
the submission.

Caching, per resource, because they differ:

| Resource | TTL | Why |
|---|---|---|
| Roles | 5 min | Changes rarely, small, and a stale role in a picker is harmless |
| Channels | 5 min | Same |
| Guild emojis | 5 min | Same |
| `members?q=` | **not cached** | Per-keystroke and unbounded in cardinality; caching it would mean one Redis key per query string |
| `members?ids=` | 1 hour | Keyed per member, so five saved ids where four are warm fetches one |

`getOrSet` turned out **not** to be usable: it caches whatever the fetcher returns,
including a failure, and a five-minute memory of a transient Discord outage is worse
than the outage — every picker falls back to "paste an id", which reads as a design
decision rather than a broken integration. The routes call `getCached` and `setCache`
directly so that only a success is stored. `?refresh=1` skips the cache on the three
cached routes, so a person who just made a role in Discord is not told to wait five
minutes.

Deliberately **not** cached at the Next `fetch` layer: Redis is shared across instances and already in the request path, and `discord-rest.ts` calls `fetch` directly without `next` options.

### PR 2 — `ChannelPicker` and `RolePicker`

The easy two, and they retire the four paste-an-id sites listed at the top. Both are a `<select>` over a fetched list with a "paste an id" fallback that stays reachable — the fallback is not a nicety, it is what keeps the page usable when the bot is not in the guild.

`RolePicker` filters on the `unsafeReason` each role carries from PR 1, and keeps the
row's current value selectable whatever that reason says. It cannot call
`filterAssignableRoles` as this plan first said: that helper lives in `discord-rest.ts`
beside the bot token, so a client component cannot import it — the same constraint this
plan records for `lib/emoji.ts` under PR 4, which it had not applied here. PR 1's roles
route annotates server-side instead, and deliberately does not return the raw
`permissions` bitfield.

The comment at `discord-rest.ts:183` explains the footgun the `alwaysInclude` half
guards against — an uncontrolled `<select>` whose saved value is not among the rendered
options silently falls back to the first one — and it is worth reading rather than
paraphrasing.

Server-side handlers still validate on submit — `unsafeRoleReason` exists for that, and the endpoints are reachable by direct POST whatever the UI renders.

Administrator removes one of the two validations a channel needs but not the other. "Can the bot post here" is now always yes, so that check is redundant. "Does this channel belong to **this venue's** guild" is not, and it matters more because of the paste-an-id fallback: the field accepts any snowflake, so an id from an unrelated guild can be saved and will fail silently in the bot later. Validate the chosen channel against the guild the venue is linked to, which PR 0 is what makes possible.

### PR 3 — Wire `user-picker.tsx`

Smaller than it looks: `user-picker.tsx` and `picker-field.tsx` are already in `apps/web/components/`. The work is reading them against PR 1's routes, not writing them — they were dropped in on 31 Aug alongside `discord-rest.ts` and have never run, so expect them to need adapting rather than merely importing.

What to check when wiring: that the debounce exists and is sane, that a 429 fails fast so the next keystroke retries rather than blocking, and that the paste-an-id fallback is reachable — which matters more here than anywhere else, because with Frogge's token an XVM-only venue has no member list at all.

Also needs the *rendering* half, which no component covers: anywhere a saved Discord user id shows as a raw snowflake today, `getGuildMembers` turns it into a name and avatar, falling back to the raw id for a member who has left.

### PR 4 — `EmojiPicker`

The largest piece and the only one with new dependencies: `@twemoji/api` and `unicode-emoji-json`. Two halves in one component — guild custom emoji from PR 1's `emojis` route, and the Unicode set from the catalogue.

Port `lib/emoji.ts` as well. Its header documents a constraint that applies identically
here: the pure helpers cannot live in `discord-rest.ts`, because that module holds the
bot token and must not be importable from a client component. PR 1 hit this first with
`unsafeRoleReason` and settled it by annotating server-side rather than exporting the
helper — the same shape works for any pure emoji helper the picker needs.

`xvm-api`'s `api/emoji.py` already validates what Discord will accept as a reaction, including the `<:name:id>` custom form. The picker should produce exactly what that accepts, so a picked emoji never fails validation server-side. Worth checking the two agree before building the second half.

### PR 5 — Adopt the pickers at the remaining call sites

Mechanical once 2 to 4 are in. Kept separate so a picker landing is not blocked on touching every form, and so the diff that changes 10 call sites contains nothing else.

## Open questions

1. ~~Whose bot token~~ — decided: one bot, Frogge's, because Frogge has far more guilds.
2. ~~Where is the venue's guild id~~ — a `DiscordGuild` external link in xvm-api, and **nothing in the product writes one**. That turned a backfill question into PR 0.
3. ~~Where does PR 0's `state` live~~ — decided: Redis `setex`, deleted on read, failing closed. See PR 0.
4. ~~How badly does the missing View Channel permission bite~~ — moot. Administrator bypasses channel overwrites, so the channel list has nothing to filter and the bot can post anywhere. **The role-hierarchy caveat survives it** and belongs in setup guidance.
5. ~~What does a venue show when the bot isn't in its guild~~ — Frogge already built it: `FroggeBot/Dashboard/src/components/BotNotInGuildBanner.tsx`, a persistent banner naming the guild, saying saved settings are safe, explaining that live Discord reads cannot load, and linking the invite. Its header comment records the hour of log archaeology that preceded it. Port rather than design, and it belongs with PR 1 or 2, wherever the first picker can come back empty.
6. **Does `api/emoji.py` accept everything the emoji picker can emit?** Check before PR 4, not after. The last genuinely open question.
