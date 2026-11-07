import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  FLOW_COOKIE,
  FLOW_COOKIE_MAX_AGE_SECONDS,
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  siteUrl,
  xivauthConfig,
} from "@/lib/api/xivauth"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.redirect(new URL("/auth/signin", siteUrl()))

  const config = xivauthConfig()
  if (!config) {
    return NextResponse.redirect(new URL("/dashboard/account/characters?xivauth=unavailable", siteUrl()))
  }

  const { verifier, challenge } = createPkcePair()
  const state = createState()
  const response = NextResponse.redirect(buildAuthorizeUrl(config, state, challenge))
  response.cookies.set(FLOW_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/xivauth",
    maxAge: FLOW_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
