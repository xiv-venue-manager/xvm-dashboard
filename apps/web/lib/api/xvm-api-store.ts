import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getToken } from "next-auth/jwt"
import type { CredentialIssued } from "@/lib/api/xvm-api"
import { getMe, listMemberships, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

export interface XvmCredential {
  token: string
  expiresAt: number
}

export function xvmCredentialFrom(issued: CredentialIssued): XvmCredential {
  if (!issued.credential.expires_at) {
    throw new Error("xvm-api credential is missing expires_at")
  }
  return { token: issued.secret, expiresAt: new Date(issued.credential.expires_at).getTime() }
}

export function isXvmCredentialFresh(credential: XvmCredential | undefined): credential is XvmCredential {
  return !!credential && credential.expiresAt - Date.now() >= REFRESH_MARGIN_MS
}

// The person's xvm-api token lives in the encrypted session JWT (set in the jwt callback in
// lib/auth.ts). It is read here with getToken and never put on the `session` object, which the
// browser can read at /api/auth/session.
//
// next-auth v4 can only rewrite that cookie on its own session endpoint, so a route handler or
// page cannot clear a rejected token. The next sign-in replaces it.
export async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const jar = await cookies()
  const jwt = await getToken({
    // getToken only reads cookies and headers, and a NextRequest is not needed to supply them.
    req: { cookies: Object.fromEntries(jar.getAll().map((c) => [c.name, c.value])), headers: {} } as never,
    cookieName: SESSION_COOKIE_NAME,
  })
  if (!jwt || jwt.id !== userId) return null
  return isXvmCredentialFresh(jwt.xvm) ? jwt.xvm.token : null
}

/** True only for a genuine "xvm-api rejected this token" failure, not a network blip or timeout. */
export function isXvmAuthFailure(err: unknown): err is XvmApiError {
  return err instanceof XvmApiError && err.status === 401
}

/**
 * Standard catch-block response for a failed xvm-api call in a route handler:
 * a non-401 XvmApiError passes its status/message through as-is, a 401
 * logs and asks the user to sign in again, and anything else (network blip,
 * DNS failure, etc.) logs and returns a generic 503.
 */
export async function xvmApiErrorResponse(err: unknown, _userId: string, logLabel: string): Promise<NextResponse> {
  if (err instanceof XvmApiError && err.status !== 401) {
    return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
  }
  if (isXvmAuthFailure(err)) {
    console.error(`${logLabel}:`, err)
    return NextResponse.json({ error: "xvm-api link needs to be refreshed. Sign out and back in." }, { status: 503 })
  }
  console.error(`${logLabel}:`, err)
  return NextResponse.json({ error: "xvm-api request failed" }, { status: 503 })
}

/**
 * The signed-in user's xvm-api person id, from /me. Returns null if there's no valid token,
 * matching getValidXvmApiToken's contract.
 */
export async function getValidXvmApiPersonId(userId: string): Promise<number | null> {
  const token = await getValidXvmApiToken(userId)
  if (!token) return null
  return (await getMe(token)).person?.id ?? null
}

// xvm-api owns venue membership. The invite flow creates rows there and never mirrors them
// into Prisma (app/api/invites/[token]/accept/route.ts), so a Prisma OWNER row only exists for
// whoever created the venue - anyone promoted to owner through the staff UI has none, and a
// Prisma check would refuse them while xvm-api allowed the write.
//
// Defence in depth rather than the only guard: POST and DELETE /venues/{id}/links both call
// require_tier(Owner) themselves. It earns its place by keeping authority ahead of the Discord
// calls. `effective_tier` is what require_tier compares, so a temporary owner grant counts here
// exactly as it does there.
export async function isVenueOwner(
  userId: string,
  personToken: string,
  xvmApiVenueId: string
): Promise<boolean> {
  const personId = await getValidXvmApiPersonId(userId)
  if (personId === null) return false
  const memberships = await listMemberships(personToken, xvmApiVenueId)
  return memberships.some((row) => row.person.id === personId && row.effective_tier === "owner")
}
