import { redis, ready } from "@/lib/redis"

/**
 * Cache-aside layer backed by the shared ioredis singleton.
 *
 * Keys are manually prefixed with "cache:" here (no client-side keyPrefix
 * option) so the same connection can serve both the rate limiter ("rl:"
 * prefix) and this cache.
 *
 * Fail-open: any Redis error returns null/no-op so a cache outage degrades
 * to direct DB hits, never to a 500.
 */

const PREFIX = "cache:"
const k = (key: string) => `${PREFIX}${key}`

/**
 * Cache TTL (Time To Live) configurations
 */
export const cacheTTL = {
  venue: 300, // 5 minutes
  venueSettings: 600, // 10 minutes
  membership: 300, // 5 minutes
  user: 300, // 5 minutes
  services: 600, // 10 minutes (services don't change often)
  transactions: 180, // 3 minutes (more dynamic)
  publicStats: 300, // 5 minutes (public /stats page)
  // Discord guild metadata. Short, because someone who just made a role in Discord comes
  // straight back to the picker expecting to see it; the routes also take ?refresh=1.
  discordGuild: 300, // 5 minutes (roles, channels, custom emoji)
  // Resolving a saved Discord user id to a name and avatar. Long, because these are rendered
  // on every form that holds one and a display name rarely changes.
  discordMember: 3600, // 1 hour
}

/**
 * Cache key prefixes (the "cache:" namespace prefix is added by k() at
 * the boundary of every Redis call, not here).
 */
export const cacheKeys = {
  venue: (id: string) => `venue:${id}`,
  venueSettings: (id: string) => `venue:${id}:settings`,
  venueBySlug: (slug: string) => `venue:slug:${slug}`,
  membership: (userId: string, venueId: string) => `membership:${userId}:${venueId}`,
  userVenues: (userId: string) => `user:${userId}:venues`,
  venueServices: (venueId: string) => `venue:${venueId}:services`,
  venueTransactions: (venueId: string, params: string) => `venue:${venueId}:transactions:${params}`,
  publicStats: () => `public:stats`,
  discordRoles: (guildId: string) => `discord:${guildId}:roles`,
  discordChannels: (guildId: string) => `discord:${guildId}:channels`,
  discordEmojis: (guildId: string) => `discord:${guildId}:emojis`,
  // Per member rather than per request: a form holding five saved ids where four are cached
  // should fetch one, not five.
  discordMember: (guildId: string, userId: string) => `discord:${guildId}:member:${userId}`,
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!ready() || !redis) return null
  try {
    const raw = await redis.get(k(key))
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`[redis-cache] get error for key ${key}:`, error)
    return null
  }
}

export async function setCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  if (!ready() || !redis) return
  try {
    await redis.setex(k(key), ttlSeconds, JSON.stringify(data))
  } catch (error) {
    console.error(`[redis-cache] set error for key ${key}:`, error)
  }
}

/**
 * Invalidate a single key, or all keys matching a glob pattern.
 *
 * Patterns are scanned with the "cache:" prefix already applied so we
 * never accidentally match other namespaces (e.g. "rl:*").
 */
export async function invalidateCache(keyOrPattern: string): Promise<void> {
  if (!ready() || !redis) return
  try {
    if (keyOrPattern.includes("*")) {
      let cursor = "0"
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", k(keyOrPattern), "COUNT", 100)
        cursor = next
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } while (cursor !== "0")
    } else {
      await redis.del(k(keyOrPattern))
    }
  } catch (error) {
    console.error(`[redis-cache] invalidate error for ${keyOrPattern}:`, error)
  }
}

export async function getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds: number): Promise<T> {
  const cached = await getCached<T>(key)
  if (cached !== null) return cached
  const data = await fetchFn()
  await setCache(key, data, ttlSeconds)
  return data
}
