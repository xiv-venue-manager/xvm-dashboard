# Shared assets

Look here before building something. Everything below already exists in `apps/web` on `dev`. If you add a reusable piece, add a line here in the same PR.

Paths are relative to `apps/web`. Names are the real exports.

## UI primitives (`components/ui/`)

`alert`, `alert-dialog`, `avatar`, `badge`, `button`, `calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `select`, `sheet`, `switch`, `table`, `textarea`.

House-specific:

| Component | Use it for |
|---|---|
| `data-table` (`DataTable`, `DataTableColumn`) | Tables with per-column `hideOnMobile` and alignment |
| `date-time-picker` | A date and time field |
| `stat-readout` | A labelled figure with an icon variant (`blue`, `success`, `warning`, `default`) |
| `crystal-divider` | The XIV section divider |
| `loading-spinner` | A spinner |

## Feature components (`components/`)

| Component | Use it for |
|---|---|
| `server-time` | Every displayed time. Server Time (UTC) is the default, never a raw date formatter. Re-exports `formatServerTime`, `formatServerTimeRange`, `formatLocalTimeRange` |
| `venue-context` | The active venue, via React context |
| `venue-switcher`, `venue-layout`, `venue-sidebar`, `navbar` | Page chrome |
| `item-search-combobox` | Searching game items |
| `discord-picker` | `RolePicker`, `ChannelPicker`, `DiscordOptionPicker`, `useDiscordOptions`: choose a Discord role or channel from the venue's server. Use these instead of a hand-rolled dropdown or a paste-an-id field |
| `user-picker` | `UserPicker`: find a Discord member by typing part of the name, with entering an id as the fallback. Keyed to a venue |
| `discord-members` | `MemberChip`, `useResolvedMembers`: put names and avatars on Discord ids a page already holds. `useResolvedMembers` asks the members route once per id, in as many requests as its cap needs; `MemberChip` renders whatever label the caller decided on. This is for a table of saved ids — `user-picker` is for choosing a new one |
| `emoji-picker` | `EmojiPicker`: an emoji field — a text input that still takes a typed or pasted value, with a picker beside it. `source="venue"` offers that venue's custom emoji, `source="application"` the bot's own, for a platform surface with no venue to scope to. Unicode either way |
| `emoji-glyph` | `EmojiGlyph`: render a stored emoji value. A custom emoji is `<:name:id>` markup, which shows as literal text anywhere it is not passed through this |
| `role-badge`, `breadcrumb`, `venue-eyebrow`, `copy-address-button` | Small display pieces |
| `analytics/` | Charts |

**Do not build on `picker-field`.** It is an unwired port from Frogge with its own tokens and URLs, and nothing uses it. Its header comment says so.

## Helpers (`lib/`)

| File | Exports | Notes |
|---|---|---|
| `utils` | `cn` | Class names |
| `api-fetch` | `apiFetch`, `ApiError` | Client fetch. `ApiError.status` is 0 for a network failure |
| `poll-until` | `pollUntil` | Poll with an interval and a timeout |
| `use-mounted` | `useMounted` | Hydration-safe client check |
| `validation` | `SNOWFLAKE_PATTERN`, `validators` | zod validators. Use these for any Discord id. A snowflake is a string, never a number |
| `format` | `formatGil`, `formatGilCompact` | Gil amounts |
| `server-time` | `getServerTimeLabel`, `formatServerTime`, `formatServerTimeRange`, `formatLocalTimeRange`, `getServerTimeIntlOptions` | |
| `local-day` | `localDayKey`, `localHourLabel`, `browserTimeZone`, `localTimeInput`, `endOfLocalDayUtc` | Calendar days in a given timezone |
| `shift-format` | `fmtHour`, `statusBadgeClass`, `toShiftRow`, `staffNameOf`, ... | Shift display |
| `discord-picker-state` | `pickerProblem`, `offeredRoles`, `canReturnToList`, `canReturnToSearch`, `showsManualEntry`, `initials`, `MIN_MEMBER_QUERY`, `memberQueryReady`, `memberSearchProblem` | The tested rules behind the Discord pickers. `canReturnToList` and `canReturnToSearch` are the way-back rules, `initials` is the avatar fallback (the first two letters or digits of a name, `#` when it has none) used by `discord-guild-connect` and `user-picker`, and `MIN_MEMBER_QUERY` is the 2 character floor for a member search. Put picker decisions here, not in the component |
| `discord-member-state` | `unresolvedIds`, `batches`, `memberLabel`, `MAX_RESOLVE` | The tested rules behind `discord-members`. Keyed on *asked*, not *found*: `getGuildMembers` omits a member who has left, so "do we have a name yet" re-requests them on every render. `batches` splits a list at `MAX_RESOLVE`, the members route's cap for one request — cap at the request, never in `unresolvedIds`, or the overflow is dropped instead of asked for |
| `emoji` | `DiscordEmojiOption`, `customEmojiCdnUrl`, `customEmojiMarkup`, `parseCustomEmojiMarkup`, `twemojiCdnUrl` | Emoji resolution behind `emoji-picker` and `emoji-glyph`. Client-safe on purpose: `DiscordEmojiOption` lives here rather than in `discord-rest`, which holds the bot token and must stay out of a Client Component's imports. `twemojiCdnUrl` answers null for anything that is not an emoji — it is gated on `twemoji.test` so a plain string cannot come back as a CDN URL built from its own letters |
| `discord-invite` | `DISCORD_BOT_INVITE_URL` | The link that installs the bot. It names only `client_id`, so the Developer Portal's install settings decide its scopes and permissions. `NEXT_PUBLIC_DISCORD_APPLICATION_ID` is baked in at build time |
| `connect-discord` | `guildIdFrom`, `signInUrl`, `ownedVenues`, `hasLiveServer`, `connectView`, `connectServer`, `ConnectView`, `ConnectServer`, `ConnectableVenue` | Connecting a Discord server to a venue: the `/connect/discord` page's rules, and the one call that page and the get-started wizard share. `signInUrl` builds a sign-in link that returns to a path, query and all |
| `discord-user` | `discordGrantFrom`, `discordGrantFromPage`, `listManageableGuilds`, `administersGuild` | The signed-in person's own Discord grant, from a route's request or a server page's cookies, and the servers it says they manage. Server only |
| `display-name` | `resolveDisplayName` | The one order for what to call a staff member |
| `roles` | `canManageVenue`, `isVenueOwner` | OWNER and MANAGER tier checks |
| `callback-url` | `signInCallbackUrl` | Where sign-in returns to. Link to `/auth/signin?callbackUrl=<path>`; anything but a same-origin path falls back to `/dashboard` |
| `sign-in-reason` | `DELETION_REASON`, `DELETION_SIGN_IN_URL`, `signInNotice` | The one reason code and notice text for a session ended by a pending deletion. Redirect to `DELETION_SIGN_IN_URL`; the sign-in page passes `?reason=` to `signInNotice`, which answers null for an unknown or missing reason |
| `redis-cache` | `getCached`, `setCache`, `getOrSet`, `invalidateCache`, `cacheKeys`, `cacheTTL` | Cache-aside. `getOrSet` cannot skip caching a failure, use `getCached` and `setCache` for that |
| `rate-limit`, `middleware/with-rate-limit` | `withRateLimit`, `checkLimit`, `budgets` | Wrap an API route handler |
| `storage` | `getUploadUrl`, `deleteObject`, `keyFromUrl` | MinIO |
| `sse/` | `venue-events`, `sale-visibility` | Live venue events |

## xvm-api layer (`lib/api/`)

| File | Use it for |
|---|---|
| `xvm-api` | The typed client: every xvm-api call, plus `XvmApiError` and `xvmErrorMessage` |
| `xvm-api-store` | `getValidXvmApiToken`, `xvmApiErrorResponse`, `isXvmAuthFailure`, `getValidXvmApiPersonId` |
| `xvm-page-read` | `xvmPageReader`, `xvmPersonReader`: the safe pattern for a server page read |
| `venue-access` | `requireVenueRole`, `atLeast`, `roleInVenue`, `myVenueRoles`: venue role gates, resolved from xvm-api |
| `venue-guild` | `requireVenueGuild`, `discordFailureResponse`, `wantsRefresh`: the venue's Discord server for a signed-in caller (#157) |
| `*-shape`, `position-convert`, `task-convert` | Mappers from xvm-api rows to what the UI expects. Look for one before writing another |

`lib/discord-rest.ts` holds the Discord REST fetchers and the role-safety helpers (`unsafeRoleReason`, `filterAssignableRoles`). It is server only, because it sits beside the bot token.

## Design tokens (`app/globals.css`)

shadcn colour variables (`--background`, `--primary`, `--card`, and so on), `--xiv-blue`, `--xiv-blue-border`, `--xiv-blue-dim`, `--xiv-navy`, `--fg-subtle`, `--fg-faint`, and a `--ctp-*` scale. There are no light-mode tokens. Use the variables, not raw colours.

## Types

`packages/types` (`models`, `enums`, `venue-settings`) and `lib/types/`.

## Going away

These still work but sit on Prisma, which is being removed. Do not build new things on them: `lib/prisma`, the Prisma-backed parts of `lib/api/xvm-api-store` (the credential table), and `lib/shift-bot`. See `docs/PRISMA_MIGRATION_MANIFEST.md`.

## What does not exist

No shared hooks (`hooks/` is empty) and no test utilities. The package has no jsdom, so a component cannot be unit-tested. Put decisions in a pure `lib/` file and test that, as `lib/pending-invites` does.
