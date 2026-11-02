# Local Full-Stack Development

For testing changes (especially auth/rate-limit work, see the
codebase-sweep Stage 2 plan) against a real local stack instead of prod.

## One-time setup

1. `docker compose -f docker-compose.local.yml up -d` — starts local
   Postgres (`localhost:5433`) and Redis (`localhost:6380`).
2. Check whether `apps/web/.env.local` already exists before building one
   from scratch — a prior local-dev session may have already configured it
   with Discord OAuth credentials and other service creds (MinIO, Resend,
   Sentry, Hermes). In that case, just repoint `DATABASE_URL`, `DIRECT_URL`,
   and `REDIS_URL` at this compose file's containers (ports 5433/6380
   respectively). Only build the file from scratch if it's genuinely
   missing — see
   `docs/superpowers/plans/2026-08-15-local-fullstack-copy.md` Task 2 for
   the full variable list. The file lives at `apps/web/.env.local`, **not**
   a repo-root `.env.local` — Next.js reads env files from the app
   directory it runs in.
3. One-time manual step (if not already done): add
   `http://localhost:3000/api/auth/callback/discord` as a redirect URI on
   the Discord app (dev portal, OAuth2 → Redirects). Discord supports
   multiple redirect URIs per app, so this is additive and doesn't touch
   the prod redirect.

## Every session

```bash
docker compose -f docker-compose.local.yml up -d   # if not already running
pnpm install
cd apps/web && pnpm dev
```

Sign in at `http://localhost:3000/auth/signin` with Discord. Create/reuse a
disposable local venue for testing — this is a throwaway local DB, not
prod, so no special naming convention is required (unlike the
`TEST_VENUE`/"Velvet Rift" discipline used against the shared prod DB).

## Plugin against local

The plugin is never loaded via dev-plugin injection for this project — it
ships only through the GitHub release zip and Dalamud's normal in-game
update flow. To point an already-installed plugin at local:

1. Launch the game normally (plugin already installed via the normal
   update channel).
2. Open the plugin's Settings tab (`/xvenue` in-game, Settings tab,
   XIV-App Sync section).
3. Change the server URL from `https://xivvenuemanager.com` to
   `http://localhost:3000`.
4. Generate a venue-scoped API key from the local dashboard's
   Settings → API Keys page, paste it into the plugin's server URL field's
   companion API key field.
5. Click "Fetch Venues" and pick the local test venue.

This was verified live: `pnpm dev`'s log showed real `200` responses from
`/api/plugin/venues`, `/api/plugin/roles`, `/api/plugin/services`,
`/api/plugin/patrons/vip`, `/api/plugin/patrons/banned`,
`/api/plugin/inventory-settings`, and `/api/plugin/shifts` — no plugin
code changes or rebuild needed.

## Resetting

`docker-compose.local.yml` mounts `docker/postgres-local/data` as a host
bind mount, not a Compose-managed named volume — `down -v` has no effect on
it. To wipe the local DB and Redis entirely:

```bash
docker compose -f docker-compose.local.yml down
sudo rm -rf docker/postgres-local/data  # postgres's official image runs as root, so the dir is root-owned
docker compose -f docker-compose.local.yml up -d
```

## xvm-api (dashboard token exchange)

The dashboard talks to `xvm-api` (repo `xiv-venue-manager/xvm-api`, `dev`
branch) for the API token exchange. Run it locally rather than pointing at
prod:

1. Clone it outside this monorepo, e.g. `~/xvm-api`:
   ```bash
   git clone -b dev git@github.com:xiv-venue-manager/xvm-api.git ~/xvm-api
   ```
2. Install deps and apply migrations (SQLite by default, no Postgres
   needed):
   ```bash
   cd ~/xvm-api
   uv sync --group dev
   uv run alembic upgrade head   # creates apiv2.db, needed before first run
   ```
3. Run it:
   ```bash
   uv run apiv2
   ```
   Serves on `http://127.0.0.1:8000`. Confirm with `curl
   http://127.0.0.1:8000/health` (expect `{"status":"ok"}`) and `curl
   http://127.0.0.1:8000/health/deep` (also round-trips the DB).
4. Mint a dashboard service credential against the local instance:
   ```bash
   uv run python -m api.scripts.issue_credential --kind service --client dashboard --name "Dashboard dev"
   ```
   The `secret` is shown once — copy it, the server only keeps the hash.
5. Set it in `apps/web/.env` (untracked, not committed):
   ```
   XVM_API_BASE_URL=http://127.0.0.1:8000
   XVM_API_DASHBOARD_SERVICE_TOKEN=<the secret from step 4>
   ```
