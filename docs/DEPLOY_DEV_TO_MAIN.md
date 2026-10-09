# Deploying `dev` to prod (`main`)

Prod runs `main` against the `venue_manager` Postgres. `dev` runs against `dashboard_dev`. The prod deploy script has no schema step, and prod has no migrations table, so schema changes are applied by hand from `docs/deploy/`.

## Never do this on prod

`pnpm db:push --accept-data-loss`. The `dev` Prisma schema has dropped four tables and several columns that still hold data in prod. A push would silently delete them.

## What differs (prod schema as of 2026-10-09 vs `dev`)

| Kind | Objects | File |
|---|---|---|
| Additive | `services.xvmApiServiceId`, `venues.xvmApiVenueId/LinkedAt/LinkedBy` (unique on id), table `xvm_api_credentials` | `docs/deploy/01-additive.sql` |
| Destructive | `patrons.isVip/vipSetAt/vipSetById` (+ index, FK), `venues.location`, tables `device_tokens`, `notification_preferences`, `refresh_tokens`, `rooms` | `docs/deploy/99-cleanup-after-cutover.sql` |

Only the additive file is needed for `dev` code to run. The drops are safe to defer: the new code does not read the dropped objects, and the old columns and tables just sit unused.

All three SQL files were generated with `prisma migrate diff` against a restored copy of prod's structure, then applied in a throwaway Postgres. After 01 the only remaining diff was the drops. After 99 the diff was empty. 02 returned the database to the starting state.

## Prerequisite: xvm-api in prod

Prod has no xvm-api container and no `XVM_API_BASE_URL`. The `dev` code reads people, venues, shifts, events and more from xvm-api, so deploying `dev` before a prod xvm-api exists and is loaded breaks the site. Deploying `dev` to prod is the cutover. Sequence it with the migration load (`docs/MIGRATION_EXPORTS.md`), and with Allegro.

## Procedure

1. **Backup.** `pg_dump -Fc venue_manager > venue_manager-$(date +%F).dump` on the DB host. Restore-check it into a scratch DB before continuing.
2. **Apply additive SQL** while the old code is still running (it ignores the new columns): `psql -v ON_ERROR_STOP=1 venue_manager < docs/deploy/01-additive.sql`. It runs in one transaction.
3. **Prod xvm-api up and loaded**, `XVM_API_BASE_URL` and credentials set on the `venue-manager` container.
4. **Merge `dev` to `main`, deploy** with the usual script. Check sign-in, a venue page, the plugin.
5. **Rollback.** Redeploy the previous `main` image. The old code ignores the additive objects, so no schema rollback is needed. To remove them anyway: `docs/deploy/02-rollback-additive.sql` (drops `xvm_api_credentials` and the link columns, so run it only if nothing has been linked).
6. **Cleanup, later.** Once the cutover has soaked and nothing needs the old data, take a fresh backup and run `docs/deploy/99-cleanup-after-cutover.sql`. This is irreversible without the backup.

## Re-check before running

Schema drift can reappear. Re-run the diff against prod just before the deploy: dump prod structure, restore it to a scratch Postgres, then `DATABASE_URL=<scratch> pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` from `apps/web`. If the output differs from the files above, regenerate them.
