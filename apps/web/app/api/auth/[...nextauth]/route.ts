import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest } from "next/server"
import { checkLimit, getIp, buildRateLimitResponse } from "@/lib/rate-limit"

const nextAuthHandler = NextAuth(authOptions)

/**
 * Per-IP throttle on the OAuth dance. Targets the expensive paths only:
 *   /api/auth/signin/<provider>  - kicks off CSRF + redirect to Discord
 *   /api/auth/callback/<provider> - exchanges code for token, hits Discord
 *
 * Polled paths (/session, /csrf, /providers) are intentionally exempt -
 * the NextAuth client polls /session aggressively and we'd break legit
 * session refresh. The expensive paths are sub-1/min per real user.
 *
 * Budget: 10/min/IP. A normal sign-in is 2 hits (signin + callback);
 * 10 leaves headroom for CSRF retries while capping token-exchange spam.
 */
const AUTH_THROTTLE_RE = /\/api\/auth\/(signin|callback)\//

async function withAuthThrottle(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }): Promise<Response> {
  if (AUTH_THROTTLE_RE.test(req.nextUrl.pathname)) {
    const ip = getIp(req)
    const rl = await checkLimit(`auth-ip:${ip}`, 10, 60)
    if (!rl.success) {
      return buildRateLimitResponse(rl, "Auth flow rate limit exceeded")
    }
  }
  return nextAuthHandler(req, ctx)
}

export { withAuthThrottle as GET, withAuthThrottle as POST }
