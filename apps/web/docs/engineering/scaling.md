# Scaling

> Companion to [CASE_STUDY.md](../../CASE_STUDY.md). The case study summarizes; this doc walks the actual numbers and decision points.

## Where I am right now

Single self-hosted Linux server. Seven containers via Docker Compose:

| Container       | Image                                       | Purpose                                 |
| --------------- | ------------------------------------------- | --------------------------------------- |
| `venue-manager` | `node:20-alpine` (Next.js standalone build) | App tier                                |
| `postgres`      | `postgres:16`                               | Persistence                             |
| `redis`         | `redis:7-alpine`                            | Cache + rate limit                      |
| `xiv-stats`     | `node:20-alpine`                            | Homepage stats API                      |
| `adminer`       | `adminer`                                   | DB admin UI (internal only)             |
| `static-ehno`   | `nginx:alpine`                              | Static site at ehno.xivvenuemanager.com |

Headroom snapshot (April 2026):

| Resource                      | Used              | Allocated     | Headroom   |
| ----------------------------- | ----------------- | ------------- | ---------- |
| Redis memory                  | 1.18 MB           | 256 MB        | 99.5% free |
| Redis evicted keys (lifetime) | 0                 | unbounded LRU | n/a        |
| Postgres connections          | low single digits | default 100   | very high  |
| Container disk                | 12 GB             | 24 GB         | 50% free   |

The scaling constraint is architectural, not infrastructure capacity.

## The four design choices that affect scaling

### 1. In-process SSE bus

The live page (`/dashboard/<venue>/live`) gets real-time patron events through `lib/sse/venue-events.ts`, an in-process Node `EventEmitter` keyed by `venueId`. This is fast, simple, and single-replica.

**Capacity:** thousands of concurrent live-page viewers per process. Memory cost per open SSE connection is ~10-50 KB.

**Scaling boundary:** the moment the app needs a second `venue-manager` replica, the bus stops working - events emitted in replica A never reach SSE clients connected to replica B.

**Migration path:** Redis pub/sub. Already provisioned. The change is roughly:

- Replace `eventEmitter.emit(channel, payload)` with `redis.publish(channel, JSON.stringify(payload))`
- Replace `eventEmitter.on(channel, fn)` with a Redis subscriber connection
- ~50 lines, contained to `lib/sse/venue-events.ts`

**When to migrate:** when the app tier needs to scale horizontally. With current single-replica the bus is correct.

### 2. `prisma db push` instead of migrations

Solo project, fast iteration: `prisma db push` updates the live database schema without producing migration files. No `_prisma_migrations` table on the live database. Schema changes are applied via raw SQL on the postgres container; the `prisma/migrations/` directory is kept for repo history only.

**Why this was right early:** schema iterated multiple times per week. Authoring a migration for each iteration would have been pure tax.

**Why this is wrong now:** the schema is at v19 tables. Recent changes are stable enough that an audit trail would be useful. Replaying schema state from the current `schema.prisma` works, but I can't reconstruct the _path_ there from `git log`.

**Migration path:** baseline the current production schema as a single migration, switch to `prisma migrate deploy` going forward. Documented in memory; not yet executed.

### 3. Single Redis with two namespaces

`lib/redis.ts` exports one ioredis client. Both `lib/rate-limit.ts` and `lib/redis-cache.ts` import it. Keys are namespaced by manual prefix:

- `rl:` for rate-limit counters (1-min TTL)
- `cache:` for cache-aside entries (3-10 min TTL)

`maxmemory 256mb` with `allkeys-lru` eviction. Persistence disabled (`--save "" --appendonly no`) because both layers are ephemeral by design.

**Capacity at 1000 active users:**

- Cache entries average ~5-10 KB. 1000 users × ~50 cached objects each = ~25 MB. 10% of allocation.
- Rate-limit counters are ~50 bytes each, 1-min TTL. 1000 IPs + 1000 keys × 3 buckets each = ~150 KB. Trivial.

**Scaling boundary:** ~10,000 active users start to pressure the 256 MB cap, at which point LRU eviction kicks in. That's working as designed - not a problem until cache hit rate drops noticeably.

### 4. Rate limit budgets

Per `lib/rate-limit.ts`:

| Layer                            | Budget          | Reasoning                                                                                            |
| -------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Per-IP, web routes               | 200/min default | Dashboard auto-refresh + multi-panel pages. Generous.                                                |
| Per-IP, OAuth signin/callback    | 10/min          | Sign-in is sub-1/min per real user. 10 covers CSRF retries.                                          |

These are all configured via `budgets` in `lib/rate-limit.ts` and constants in `with-rate-limit.ts`. Adjustable per-route.

**When to retune:** when the metrics from #5 below show specific budgets being hit by legit users. Today nobody hits any of them.

## Decision points: what changes at 10x and 100x

### At 10x current usage (~hundreds of active venues)

Probably nothing breaks. The bottleneck is likely Postgres query latency on the analytics dashboards, not infrastructure or app-tier capacity. Mitigations available:

- Add indexes where `EXPLAIN ANALYZE` shows seq scans
- Tune `cacheTTL` upward where data tolerates staleness (services, venue settings)
- Add read replicas if read load saturates the primary

### At 100x current usage (~thousands of active venues)

Architectural changes warranted:

- **Replace in-process SSE bus with Redis pub/sub** (#1 above). Required to scale app tier horizontally.
- **Switch to Prisma migrations** (#2 above). Required for any team larger than one or for change-management discipline.
- **Promote Postgres to managed service** (e.g. RDS / managed Postgres). Backup + failover + monitoring become non-negotiable.
- **Add per-user-tier rate limits.** Today every API key has the same budget. At 100x scale, premium tiers + free tiers may want different ceilings.
- **Add cache stampede protection in `getOrSet`.** Single-flight pattern (in-process `Map<string, Promise<T>>`) so a hot key expiring under concurrent load doesn't N-fan-out to N database hits. Currently deferred; would matter at 100x because hot-key QPS would cross the threshold.
- **Add cache hit/miss observability.** Prometheus counters or sampled logs by namespace, so TTL tuning becomes data-driven instead of guess-driven.

Every one of these is a contained change. The current architecture isn't blocking any of them. Items 5 and 6 (stampede + observability) are documented with their trigger conditions.

## What was just shipped (May 2026)

1. **Nonce-based CSP.** Moved CSP from `next.config.ts` (static) to `proxy.ts` (per-request). Per-request nonce generated via `crypto.randomUUID()`, stamped automatically on all Next.js `<script>` tags. `unsafe-inline` and `unsafe-eval` removed from `script-src`. No architectural impact; contained to `proxy.ts`.

2. **Adminer added to compose stack.** Previously a manually started standalone container with no restart policy. Now managed alongside the rest of the stack; restarts automatically.

## What was shipped before that (April 2026)

A scaling-prep session that closed three production gaps:

1. **Redis client consolidation.** Was: two ioredis instances (one per module). Is: one shared singleton via `lib/redis.ts`. Removes connection-overhead duplication. Logs went from `[rate-limit] Redis ready` + `✅ Redis caching enabled` to a single `[redis] ready`.

2. **Cache layer made functional.** Was: `redis-cache.ts` targeted Upstash REST API; Upstash creds were never set; every cache call silently returned null. Is: ioredis against the local Redis container; cache is now actually populating. Six routes benefit immediately (venues, services × 2, transactions × 2, plus a helper).

3. **Plugin rate limit ordering fix.** Was: `validateApiKey()` ran before the rate limit, so bad/missing keys 401-short-circuited before any counter incremented. Is: `enforcePluginIpRateLimit()` runs first, capping unauthenticated probing at 60/min/IP. Verified with 80-burst → 60×401 + 20×429.

Net diff: -228 lines, +150 lines, three dead Upstash deps removed, two security gaps closed.

## What's left

In persistent memory for whenever traffic justifies the work:

- **Cache stampede protection** in `getOrSet`. Triggers: cache hit rate >1k lifetime, or any single key >50 RPS.
- **Cache observability** (per-namespace hit/miss). Trigger: same as above.
- **Multi-replica web tier** (requires SSE bus migration). Trigger: app-tier CPU sustains >70% under steady load.

For the underlying architecture, see [architecture.md](./architecture.md). For the security posture, see [security.md](./security.md).
