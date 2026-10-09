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
| `role-badge`, `breadcrumb`, `venue-eyebrow`, `copy-address-button` | Small display pieces |
| `analytics/` | Charts |

**Do not build on `picker-field` or `user-picker`.** They are unwired ports from Frogge with their own tokens and URLs. Their header comments say so.

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
| `display-name` | `resolveDisplayName` | The one order for what to call a staff member |
| `roles` | `canManageVenue`, `isVenueOwner` | OWNER and MANAGER tier checks |
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

These still work but sit on Prisma, which is being removed. Do not build new things on them: `lib/prisma`, `lib/notify`, the Prisma-backed parts of `lib/api/xvm-api-store` (the credential table), and `lib/shift-bot`. See `docs/PRISMA_MIGRATION_MANIFEST.md`.

## What does not exist

No shared hooks (`hooks/` is empty) and no test utilities. The package has no jsdom, so a component cannot be unit-tested. Put decisions in a pure `lib/` file and test that, as `lib/pending-invites` does.
