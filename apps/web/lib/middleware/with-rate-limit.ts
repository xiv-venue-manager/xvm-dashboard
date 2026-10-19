import { NextRequest, NextResponse } from "next/server"
import { checkLimit, getIp, buildRateLimitResponse } from "@/lib/rate-limit"

/**
 * Rate limiting middleware for web API routes.
 *
 * Wraps a handler and checks the requesting IP against a per-route budget.
 * Backed by the shared Redis limiter when available, in-memory fallback
 * otherwise (see lib/rate-limit.ts).
 */
export function withRateLimit<T = unknown>(
  handler: (req: NextRequest, context?: T) => Promise<NextResponse>,
  options?: {
    requests?: number
    window?: string
    getIdentifier?: (req: NextRequest) => Promise<string> | string
  }
) {
  return async (req: NextRequest, context?: T): Promise<NextResponse> => {
    const maxRequests = options?.requests || 200
    const windowSec = Math.max(1, Math.floor(parseWindow(options?.window || "1 m") / 1000))
    const identifier = options?.getIdentifier
      ? await options.getIdentifier(req)
      : `ip:${getIp(req)}:${req.method}:${req.nextUrl.pathname}`

    const rl = await checkLimit(identifier, maxRequests, windowSec)

    if (!rl.success) {
      return buildRateLimitResponse(rl, "You have exceeded the rate limit. Please try again later.")
    }

    const response = await handler(req, context)
    response.headers.set("X-RateLimit-Limit", rl.limit.toString())
    response.headers.set("X-RateLimit-Remaining", rl.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rl.reset.toString())
    return response
  }
}

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*([smhd])$/)
  if (!match) return 60000
  const value = parseInt(match[1], 10)
  const unit = match[2]
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  }
  return value * multipliers[unit]
}
