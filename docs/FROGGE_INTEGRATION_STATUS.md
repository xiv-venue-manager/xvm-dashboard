# Frogge Integration — Status Breakdown

> Current state of the XIV Venue Manager ↔ FroggeBot integration as of 2026-08-21.

> **Removed from the dashboard on 2026-10-30.** The settings card, the `frogge/*` routes and `lib/frogge-api.ts` are gone. Frogge is being handled in xvm-api and xvm-bot. The `froggeToken` and related columns stay in the Prisma schema until the migration, and the `webhooks/frogge` stub is still there. What follows describes the integration as it was.

---

## What's Built (Complete)

### Database Schema

| Field | Model | Purpose |
|-------|-------|---------|
| `froggeVenueId` | Venue | Optional link to Frogge's venue entity |
| `froggeToken` | Venue | Bearer token from Frogge redeem flow |
| `froggeConnectedAt` | Venue | Timestamp of Frogge connection |
| `froggeConnectedBy` | Venue | User who initiated connection |
| `froggeRoomId` | Room | Frogge's UUID room ID for bidirectional sync |
| `roomNumber` | Room | Maps plugin room detection to Frogge's room numbering |
| `locked` | Room | Prevents reservations (temporary: events, maintenance) |
| `disabled` | Room | Permanently removes from rotation |
| `ownerDiscordId` | Room | Unlock authority (different from current occupant) |
| `lastSyncedAt` | Room | Tracks last sync timestamp |
| `imageUrl` | Room | Cached from Frogge (permanent public GCS URLs) |

### Frogge API Client (`lib/frogge-api.ts`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `redeemCode(code)` | `POST /plugin-auth/redeem` | Exchange code for bearer token |
| `getVenues(bearerToken)` | `GET /v2/venues` | List venues (fallback for missing froggeVenueId) |
| `getRooms(froggeVenueId)` | `GET /v2/venues/:id/rooms` | Fetch rooms from Frogge |
| `walkInReserve(froggeVenueId, froggeRoomId, discordUserId)` | `POST .../rooms/:id/reserve` | Walk-in: open-ended, source=plugin_auto |
| `createReservation(froggeVenueId, froggeRoomId, params)` | `POST .../rooms/:id/reservations` | Durationed: source=plugin_manual |
| `releaseRoom(froggeVenueId, froggeRoomId)` | `POST .../rooms/:id/release` | Release a room |
| `setRoomOwner(froggeVenueId, froggeRoomId, ownerDiscordId)` | `PATCH .../rooms/:id` | Set/unset unlock authority |
| `pushRoomImage(froggeVenueId, froggeRoomId, imageUrl, sortOrder)` | `POST .../rooms/:id/images` | Push image URL reference |
| `postRoomsToDiscord(froggeVenueId)` | `POST .../rooms/post` | Publish room board (blocked: v2 renderer) |
| `getGuildMembers(bearerToken)` | `GET /guild/members` | Staff roster (blocked: endpoint doesn't exist) |

- `FROGGE_API_URL` defaults to `https://api.frogge.tech`
- Auth via `Authorization: Bearer` + `X-Frogge-Client-Id: xvm`
- Local cache fallback: tries Frogge API first, falls back to DB, syncs on success
- `syncLocalCache` keys on `froggeRoomId` (findFirst pattern), reads `status` field from Frogge response

### Plugin API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plugin/rooms` | GET | Returns rooms with `locked`, `disabled`, `roomNumber`, `ownerDiscordId` |
| `/api/plugin/rooms/reserve` | POST | Durationed reservation → `POST /reservations` on Frogge |
| `/api/plugin/rooms/release` | POST | Release → `POST /release` on Frogge |
| `/api/plugin/rooms/status` | POST | Toggle → walk-in `/reserve` (occupy) or `/release` (vacate) |
| `/api/plugin/rooms/frogge/owner` | POST | Set owner → `PATCH /rooms/:id` on Frogge |
| `/api/plugin/rooms/frogge/post` | POST | Post to Discord (blocked: Frogge v2 renderer) |
| `/api/plugin/rooms/frogge/members` | GET | Staff roster (blocked: endpoint doesn't exist) |

All mutate endpoints:
- Emit SSE `room_status` events for live dashboard sync
- `await` Frogge sync calls (no fire-and-forget)
- Resolve acting user's `discordId` from User table for Frogge calls

### Webhook Receiver (`/api/webhooks/frogge`)

- `webhook-*` headers primary, `svix-*` fallback
- Timing-safe HMAC-SHA256 signature verification
- Fail-closed: missing secret = reject in production
- Dev bypass: `NODE_ENV === "development"` only (no `x-dev-bypass` header)
- Handles all 6 event types with full DB mutations:
  - `room.created` / `room.updated` / `room.reserved` / `room.released`: upsert room, read `status` field
  - `room.deleted`: deleteMany

### Redeem Flow (`/api/venues/[venueId]/frogge/redeem`)

- Exchanges code for bearer token via `POST /plugin-auth/redeem`
- Falls back to `GET /v2/venues` when `froggeVenueId` absent (Allegro adding it to response)
- Stores token, venueId, connection timestamp on Venue model

### Plugin UI (Dalamud)

| Feature | Trigger |
|---------|---------|
| Duration dropdown (30min–8hr, 12 options) | Player enters correct free room |
| Release button | Player is in occupied room |
| Lock/Unlock toggle | Player is in correct unoccupied room |
| Disable/Enable toggle | Player is in correct unoccupied room |
| Owner display/dropdown | Frogge-connected rooms |
| Post to Discord button | Frogge-connected venues (blocked: v2 renderer) |
| Auto-open Rooms tab | Player enters private chamber (room > 0) |
| State-aware chat messages | Window is minimized, player enters room |

**Status colors:** Green = Free, Yellow = Locked, Red = Occupied, Grey = Disabled

### Dashboard UI

| Feature | Description |
|---------|-------------|
| Rooms board | Add/rename/delete rooms, set room numbers, lock/disable toggles |
| Room Manager Roles | Checkboxes to delegate room management to custom roles |
| SSE live sync | Dashboard updates in real-time when plugin mutates rooms |
| Room images | Upload UI active, pushes to Frogge on save (XVM hosts, Frogge stores reference) |

---

## Security Hardening (Done)

| Fix | Detail |
|-----|--------|
| `x-dev-bypass` removed | Caller can no longer skip signature verification |
| Fail-closed on missing secret | `WEBHOOK_SECRET` unset = reject all deliveries |
| Header names | Reads `webhook-*` primary, `svix-*` fallback |
| Timing-safe compare | `crypto.timingSafeEqual` instead of string equality |

---

## Architecture Decisions

> Established during call on 2026-08-13, refined 2026-08-21 with Allegro.

| Decision | Detail |
|----------|--------|
| Source of truth (rooms) | Frogge owns scheduling, duration, auto-reset |
| Source of truth (staff) | XVM owns membership/roles, serves roster to plugin |
| Plugin ownership | XVM owns in-game UI (live occupied toggle) |
| Webhooks | Latency optimization, `GET /rooms` always authoritative |
| Reserve split | Walk-in `/reserve` = plugin_auto (open-ended); durationed `/reservations` = plugin_manual |
| Walk-in rule | Presence doesn't evict (409), end_at caps at next booking start |
| `owner_discord_id` | Unlock authority, distinct from current occupant |
| Room status | Read from Frogge `status` field: disabled → locked → reserved → available |
| Images | XVM hosts (upload UI), Frogge stores URL reference. URLs are permanent/public GCS. |
| Owner picker | Staff roster from XVM, not Frogge (no new endpoint needed) |
| Post to Discord | XVM button, Frogge v2 renderer handles Discord message (blocked) |
| Max duration | 8 hours, overlap enforcement via SAVEPOINT |

---

## Auth Model

Frogge built Partner Access Tier (`partner_clients` / `partner_grants`).

**Pairing entry point:** `/admin menu → Settings → Integrations → Connect XIV Venue Manager`

Token flow: code redeem → bearer token stored on Venue → used for all Frogge API calls.

---

## Active Test Venue

| Field | Value |
|-------|-------|
| Location | Light · Raiden · Lavender Beds Ward 6 Plot 6 |
| Web venue ID | `cmsu8soi70002oxy5x8l6qdp4` |
| API key | `vm_cMwaMo4QKci3lV27YreJh0U-JIWEI2Rh` |

**Test rooms:**

| Name | Room # | Status |
|------|--------|--------|
| Test Room | 6 | Available |
| Left Wing | 1 | Available |
| Right Wing | 2 | Available |
| Attic | 3 | Locked |
| Back Room | 4 | Disabled |

---

## Still Blocked on Frogge

| Item | Detail |
|------|--------|
| `POST /rooms/post` | Post to Discord endpoint, blocked on FroggeBot v2 renderer switchover |
| Staff roster endpoint | `GET /guild/members` doesn't exist. We're serving the roster from XVM instead. |
| `froggeVenueId` in redeem | Allegro adding it to response (schema update). Our fallback to `GET /v2/venues` covers the gap. |

---

## What We're Waiting On From Allegro

| Item | Status |
|------|--------|
| Dev tunnel + redeem code | For testing against real `api.frogge.tech` |
| `froggeVenueId` in redeem response | Schema update in progress |
| Webhook payload field names | She's investigating outbound webhooks |
| `Partner-API-Access.md` + `Partner-Dev-Setup.md` | Didn't arrive in conversation, need resend |

---

## File Inventory

### Web App

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Room model with all Frogge fields, froggeRoomId is String (UUID) |
| `lib/frogge-api.ts` | Full Frogge API client with walk-in/durationed split, status reading |
| `app/api/plugin/rooms/route.ts` | GET rooms for plugin |
| `app/api/plugin/rooms/reserve/route.ts` | Durationed reservation → `POST /reservations` |
| `app/api/plugin/rooms/release/route.ts` | Release → `POST /release` |
| `app/api/plugin/rooms/status/route.ts` | Toggle → walk-in `/reserve` or `/release` |
| `app/api/plugin/rooms/frogge/owner/route.ts` | Set owner → `PATCH /rooms/:id` |
| `app/api/plugin/rooms/frogge/post/route.ts` | Post to Discord (blocked) |
| `app/api/plugin/rooms/frogge/members/route.ts` | Staff roster (blocked) |
| `app/api/webhooks/frogge/route.ts` | Webhook receiver with full DB mutations |
| `app/api/venues/[venueId]/frogge/redeem/route.ts` | Code exchange with venue fallback |
| `app/api/venues/[venueId]/rooms/[roomId]/route.ts` | PATCH room (image push to Frogge on save) |
| `app/api/upload/route.ts` | Presigned URL upload (XVM hosts images) |
| `mock-frogge.js` | Full mock: UUID ids, status/reservations, 409 on conflict |

### Plugin

| File | Purpose |
|------|---------|
| `XIVAppApiModels.cs` | FroggeMember, SetRoomOwnerRequest, PostRoomsRequest models |
| `XIVAppVenueApi.cs` | GetFroggeMembersAsync, PostRoomsToDiscordAsync, SetRoomOwnerAsync |
| `UI/Tabs/RoomsTab.cs` | Duration dropdown, owner UI, Post to Discord button |
| `UI/Tabs/SettingsTab.cs` | FetchFroggeMembersAsync |
| `Plugin.cs` | xivAppFroggeMembers field |
| `PluginSettings.cs` | lastServerSync tracking |

### Git Branches

| Repo | Branch | Last Commit | Status |
|------|--------|-------------|--------|
| xiv-app | `feat/frogge-plugin-proxy` | `bcd67dd` | Pushed, awaiting Allegro endpoints |
| VenueManager | `feat/frogge-integration` | pushed | Pushed, awaiting Allegro endpoints |

### Local Dev Notes

- Postgres runs on host networking (Docker bridge broken, kernel VETH pair issue). Ports: postgres=5432, redis=6380.
- `docker-compose.local.yml` restored to bridge config but containers still on host network.
- Worktree `.env.local` copied from main repo, port 5432 for host networking.
- DB schema synced via `prisma db push --accept-data-loss`.
- `tsc --noEmit` clean, 84 vitest tests pass.
