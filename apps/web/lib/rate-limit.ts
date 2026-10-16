import { NextRequest, NextResponse } from "next/server"
import { redis, ready } from "@/lib/redis"

/**
 * Fixed-window rate limiter backed by the shared ioredis singleton, with
 * in-memory fallback.
 *
 * Why fixed-window not sliding: one INCR + EXPIRE per request is cheap and
 * the ~2x burst at window edges is acceptable for abuse protection. Sliding
 * windows need ZADD + ZREMRANGEBYSCORE + ZCARD every hit.
 *
 * Why fail-open to in-mem: Redis blip should not take the plugin offline.
 * In-mem limiter catches sustained abuse from a single process.
 */

export type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number // ms since epoch when window rolls
}

// In-memory fallback. Per-process, so multi-replica deployments lose shared
// state - fine here, only one venue-manager container.
const memBuckets = new Map<string, { count: number; reset: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of memBuckets) if (v.reset <= now) memBuckets.delete(k)
}, 60_000).unref?.()

function memLimit(id: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const entry = memBuckets.get(id)
  if (!entry || entry.reset <= now) {
    const reset = now + windowMs
    memBuckets.set(id, { count: 1, reset })
    return { success: true, limit, remaining: limit - 1, reset }
  }
  entry.count++
  return {
    success: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
  }
}

/**
 * Check and increment a rate limit counter.
 * @param identifier unique key (e.g. "plugin:<keyHash>" or "ip:<ip>")
 * @param limit max requests per window
 * @param windowSec window length in seconds
 */
export async function checkLimit(identifier: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const windowMs = windowSec * 1000
  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const reset = (bucket + 1) * windowMs

  if (!ready() || !redis) {
    return memLimit(identifier, limit, windowMs)
  }

  const key = `rl:${identifier}:${bucket}`
  try {
    const count = await redis.incr(key)
    if (count === 1) {
      // +1s safety margin so key outlives its window
      await redis.expire(key, windowSec + 1)
    }
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset,
    }
  } catch (e) {
    return memLimit(identifier, limit, windowMs)
  }
}

export function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "anonymous"
}

export function buildRateLimitResponse(rl: RateLimitResult, message: string): NextResponse {
  return NextResponse.json(
    { error: "Too many requests", message },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
      },
    }
  )
}
