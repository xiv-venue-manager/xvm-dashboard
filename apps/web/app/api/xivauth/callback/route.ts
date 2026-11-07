import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiPersonId } from "@/lib/api/xvm-api-store"
import { recordVerifiedCharacters } from "@/lib/api/xvm-api"
import {
  FLOW_COOKIE,
  exchangeCode,
  fetchSharedCharacters,
  siteUrl,
  toVerifiedCharacters,
  xivauthConfig,
} from "@/lib/api/xivauth"

function readFlow(request: NextRequest): { state: string; verifier: string } | null {
  const raw = request.cookies.get(FLOW_COOKIE)?.value
  if (!raw) return null
  try {
    const flow = JSON.parse(raw) as { state?: unknown; verifier?: unknown }
    if (typeof flow.state !== "string" || typeof flow.verifier !== "string") return null
    return { state: flow.state, verifier: flow.verifier }
  } catch {
    return null
  }
}

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function redirectClearingFlow(url: URL): NextResponse {
  const response = NextResponse.redirect(url)
  response.cookies.set(FLOW_COOKIE, "", { httpOnly: true, path: "/api/xivauth", maxAge: 0 })
  return response
}

function finish(params: Record<string, string>): NextResponse {
  const url = new URL("/dashboard/account/characters", siteUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return redirectClearingFlow(url)
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return redirectClearingFlow(new URL("/auth/signin", siteUrl()))

  const config = xivauthConfig()
  if (!config) return finish({ xivauth: "unavailable" })

  const query = request.nextUrl.searchParams
  if (query.get("error")) return finish({ xivauth: "denied" })

  const flow = readFlow(request)
  const code = query.get("code")
  const state = query.get("state")
  if (!flow || !code || !state || !sameState(flow.state, state)) return finish({ xivauth: "state" })

  try {
    const accessToken = await exchangeCode(config, code, flow.verifier)
    const characters = toVerifiedCharacters(await fetchSharedCharacters(accessToken))
    if (characters.length === 0) return finish({ xivauth: "none" })

    const personId = await getValidXvmApiPersonId(session.user.id)
    if (personId === null) return finish({ xivauth: "error" })

    const outcomes = await recordVerifiedCharacters(personId, characters)
    const count = (...kinds: string[]) => String(outcomes.filter((o) => kinds.includes(o.outcome)).length)
    return finish({
      xivauth: "done",
      verified: count("created", "verified"),
      transferred: count("transferred"),
      conflicts: count("conflict"),
    })
  } catch (err) {
    console.error("[xivauth callback] failed:", err)
    return finish({ xivauth: "error" })
  }
}
