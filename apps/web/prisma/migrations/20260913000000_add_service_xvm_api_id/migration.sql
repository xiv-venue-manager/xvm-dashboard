-- Documentation-only: this repo uses `prisma db push`, not `prisma migrate`.
-- Nullable idempotency marker for scripts/migrate-services-to-xvm-api.ts —
-- lets a re-run skip services already backfilled into xvm-api.
ALTER TABLE "services" ADD COLUMN "xvmApiServiceId" INTEGER;
