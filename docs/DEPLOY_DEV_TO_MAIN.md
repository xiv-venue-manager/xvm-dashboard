# Deploying `dev` to prod (`main`)

Prod runs `main`. `dev` is promoted to `main` by fast-forward. Pushing to `main` deploys nothing: prod only changes when someone runs a deploy script by hand. Last checked 2026-11-13.

## How prod and dev are laid out

Everything runs on one host (192.168.1.122) and shares one Postgres container.

| | Prod | Dev |
|---|---|---|
| Dashboard | container `venue-manager`, built from `main` in `/home/server/xiv-app`, port 3000 (3007 during a green deploy) | `venue-manager-dev` on 3008, rebuilt by `deploy-dev.yml` on every push to `dev` |
| API | `xvm-api` on 8002, built from `main` in `/home/server/xvm-api` | `xvm-api-dev` on 8001 |
| Database | `xvm_api` | `xvm_api_dev` |

The dashboard has no database of its own. Every schema change is an Alembic migration in the xvm-api repo, so a dashboard deploy has no schema step. There is no Prisma left to run.

## Before you promote

1. CI is green on `dev` in the repos you are promoting.
2. `main` is an ancestor of `dev`, so the promotion is a fast-forward. Check with `git rev-list --count origin/dev..origin/main`, which must print 0. If it does not, merge `main` into `dev` through a PR first, as a merge commit and not a squash.
3. xvm-api: there is a single Alembic head (`uv run alembic heads`), and you have read every migration since the last promotion. Additive migrations are safe to run before the new code. Anything that drops or rewrites data needs its own plan before you start.
4. New environment variables are already in place. Prod reads `/home/server/xvm-api/.env.prod` for the API and `/home/server/xiv-app/.env` for the dashboard.
5. Nothing is live. `maintenance.sh on` refuses to run during an event. The plugin cannot retry, so patron visits, sales and clock-ins sent while the site is down are lost. Anything that touches shifts, clock-ins or the plugin API belongs in a maintenance window.

## Promote

Do the API first. The dashboard on `dev` calls API routes that prod does not have until the API is promoted.

### API

1. Fast-forward `main` to the `dev` commit you tested. This fails if it is not a fast-forward, which is what you want.

   ```
   gh api -X PATCH repos/xiv-venue-manager/xvm-api/git/refs/heads/main -f sha=<dev sha> -F force=false
   ```

2. On the server, run `~/bin/deploy-xvm-api.sh`. It fetches `main`, checks there is one Alembic head, dumps `xvm_api` into `/home/server/backups` before any migration, builds, restarts and waits for `/health`.
3. Check `/health` and `/health/deep` on `http://192.168.1.122:8002`, and `https://api.xivvenuemanager.com/health`. Read the container log for startup errors.

### Dashboard

1. Fast-forward `main` the same way, against `repos/xiv-venue-manager/xvm-dashboard`.
2. From the laptop, run `~/bin/deploy-xiv-web.sh`. Use `--green` only inside a maintenance window.
   - Plain: checks the laptop's `~/xiv-app` checkout is clean and pushes its `main`, checks the server tree is clean, pulls, rebuilds `venue-manager` on :3000 and points the Cloudflare tunnel at it.
   - `--green`: builds `venue-manager-next` on :3007, health-checks it for 30 seconds, flips the tunnel (about a 10 second gap), smoke-tests the live domain and stops the old container. Port 3007 is also the maintenance page's slot.
3. Check sign-in, a venue page, the shifts page and the plugin. Look for new errors in GlitchTip.

## Rolling back

- **Code:** do not force-push `main`. Revert the change on `dev`, promote the revert and redeploy. In an emergency, revert on `main` and merge `main` back into `dev` afterwards.
- **Database:** additive migrations need no rollback, because the old code ignores new columns and tables. If a migration did something that must be undone, restore the dump the deploy script took, right away, because it loses everything written since:

  ```
  docker exec -i postgres pg_restore -U postgres -d xvm_api --clean --if-exists < <dump file>
  ```

## Do not

- Edit prod data by hand without a `pg_dump` of `xvm_api` first.
- Promote the dashboard before the API.
- Push feature work straight to `main`. It only moves by fast-forward from `dev`, or by a hotfix that is merged back into `dev`.
- Add a workflow that deploys prod. Prod stays a manual step on purpose.

## Known rough edges in `deploy-xiv-web.sh`

- The plain path points the tunnel back at :3000 even while maintenance is on, which ends the maintenance window without saying so.
- It pushes the laptop checkout's `main`, so make sure that checkout matches `origin/main` before you run it.
- The server pull is a plain `git pull`, not `--ff-only`, and the plain path has no health check after the restart.
