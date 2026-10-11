import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/lib/session-cookie"

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // No nonce here: nonces don't apply to inline style="" attributes, and
    // including one causes browsers to ignore 'unsafe-inline' per spec,
    // blocking every style={{...}} in the app (e.g. /stats progress bars).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://cdn.discordapp.com https://raw.githubusercontent.com https://cdn.partake.gg https://*.frogge.gg${process.env.MINIO_PUBLIC_URL ? ` ${process.env.MINIO_PUBLIC_URL}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' https://discord.com https://api.github.com https://qstash.upstash.io https://errors.xivvenuemanager.com${process.env.MINIO_PUBLIC_URL ? ` ${process.env.MINIO_PUBLIC_URL}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

const PUBLIC_PATHS = [
  "/privacy",
  "/",
  "/auth/signin",
  "/auth/error",
  "/auth/signout-shoutcrafter",
  "/test",
  "/stats",
  "/discover",
  "/sitemap.xml",
  "/llms.txt",
]
const PUBLIC_PREFIXES = [
  "/.well-known/",
  "/guide/",
  "/invite/",
  "/venues/",
  "/following",
  "/discover/",
  "/api/invites/",
  "/api/shout-crafter/",
  "/api/feedback",
  "/api/stats",
  "/api/public/",
]

export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce)

  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))

  if (!isPublic) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: SESSION_COOKIE_NAME,
      secureCookie: SESSION_COOKIE_SECURE,
    })
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", req.url))
    }
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/plugin|api/discord|api/bot|api/stats|api/homepage|api/diag|api/webhooks|api/venues/[^/]+/rooms(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)",
  ],
}
