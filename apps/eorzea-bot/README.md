# Aetherlink

**XIV Venue Manager's all-in-one Discord bot.** Slash commands, platform sync, XP & Grand Company progression, a Gil economy, moderation tooling, and a webhook server that pushes venue activity straight into Discord.

## What it does

Aetherlink is the Discord half of the XIV Venue Manager platform. It lives in the same Postgres database as the web app (reading the platform's `users`/`venues`/`shifts` tables directly) and talks to the web app's bot API for the operations that belong to it.

### Platform sync

- **`/sync`** / **`/syncall`** — assigns `Venue Owner` / `Manager` / `Staff` / `Community Member` roles and a formatted nickname (`DisplayName|Venue|Role`) from the member's linked account. Runs automatically on new joins.
- **Welcome flow** — greets new members, detects their Grand Company, and points them at account linking.

### Venue operations

- **`/roll`** — returns a random venue that's open right now, optionally filtered by data center.

### Progression

- **Chat XP** — 10 XP per message (60s cooldown), doubling while an XP boost is active. Rank-ups are DMed to the member.
- **Grand Companies** — one-time `/gc join` choice (Maelstrom, Twin Adder, Immortal Flames) with rank titles, `/rank` progress bars, `/gc info` standing, and a server `/leaderboard`.
- **`/myprofile`** — full community profile: level, XP, Gil, company rank, venue visits, shifts worked, and loyalty tier.

### Gil economy

Earn Gil by reacting to bot-posted embeds (25) and submitting `/suggest`s (50). Spend it in the `/gil shop`:

- **XP Boost** (500 Gil) — 2x XP for 1 hour.
- **Cooldown Skip** (100 Gil) — bypass one chat-XP cooldown.

### Moderation

`/warn`, `/warnings`, `/kick`, `/mute`, `/unban` — all mod actions post an embed to the mod-log channel and warnings persist in Postgres.

### Webhook server

An Express server (`WEBHOOK_PORT`) that the web app calls to publish embeds: new venues, weekly summaries, venue graduations, event digests (kept in sync via tracked, editable messages), "live now" posts, patron-visit/shift XP awards, loyalty role assignments, and announcements. Protected by a shared-secret header.

### Utility

- **`/ping`** — roundtrip + websocket latency check.

## Tech stack

| Layer           | Choice                                            |
| --------------- | ------------------------------------------------- |
| Language        | TypeScript (`strict: true`), ES modules           |
| Discord         | [discord.js](https://discord.js.org) v14          |
| Database        | PostgreSQL via [Prisma](https://www.prisma.io) v6 |
| HTTP            | Express 4 (webhook server)                        |
| Runtime         | Node.js (built with `tsc`, run with `tsx` in dev) |
| Package manager | pnpm (pnpm workspace)                             |

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable                         | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`                  | Bot token from the Discord Developer Portal                                            |
| `CLIENT_ID`                      | Discord application (bot) ID                                                           |
| `GUILD_ID`                       | Test guild ID for instant guild-scoped commands; empty for global commands             |
| `DATABASE_URL`                   | PostgreSQL connection string — the same database as the web app                        |
| `WEBHOOK_PORT`                   | Port the Express webhook server listens on (default `4567`)                            |

> The code also reads additional optional vars not listed in `.env.example` (welcome/event/activity/mod-log/suggestions channel IDs, Grand Company and loyalty role IDs, `WEBHOOK_SECRET`, `WEBHOOK_HOST`). They're read directly from `process.env` at runtime; see `src/` for the exact names.

## Running

### Setup

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm prisma:generate   # generate the Prisma client
```

### Deploy slash commands

```bash
pnpm deploy-commands
```

Registers all slash commands from `src/commands/`. If `GUILD_ID` is set they register to that guild instantly; otherwise they register globally (up to 1 hour propagation).

### Development

```bash
pnpm dev
```

Runs `src/index.ts` with `tsx`, watching nothing automatically — restart to pick up changes.

### Build & start (production)

```bash
pnpm build   # tsc → dist/
pnpm start   # node dist/index.js
```

A `Dockerfile` (Node 22) is also provided: it installs deps, runs `prisma generate`, compiles with `tsc`, and starts `dist/index.js`.

## Prisma

The bot owns a small set of tables, defined in `prisma/schema.prisma`:

- `discord_members` — XP, level, Gil, GC, XP-boost/cooldown-skip state, warn count
- `discord_warn_logs` — moderation warning history
- `discord_guild_config` — per-guild config (welcome/log/auto-role/rules channels)
- `discord_tracked_messages` — message IDs for editable, re-postable embeds (digests)
- `discord_gil_reaction_rewards` — dedup markers so a reaction pays out once per message

The bot does **not** own the platform tables (`users`, `venues`, `memberships`, `shifts`, `patron_logs`, …). It reads those via `prisma.$queryRaw` against the same `DATABASE_URL` — so the web app's migrations are authoritative and the bot must share the web app's database.

Apply schema changes with `pnpm prisma:migrate` (dev) or `pnpm prisma:generate` (client only).
