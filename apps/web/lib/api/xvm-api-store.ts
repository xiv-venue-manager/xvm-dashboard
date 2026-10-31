import { NextResponse } from "next/server"
import { redis, ready } from "@/lib/redis"
import type { CredentialIssued } from "@/lib/api/xvm-api"
import { getMe, listMemberships, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

interface StoredCredential {
  token: string
  expiresAt: number
  personId?: number
}

// xvm-api keeps one live Dashboard credential per person and every exchange revokes the others,
// so the token has to be one shared copy rather than one per browser. Redis holds it under its
// own prefix, apart from "cache:", so clearing the cache does not log anyone out of xvm-api.
// A flush only costs a re-mint on the next request. `local` is the same copy for this process
// and is read only while Redis is unreachable.
const key = (userId: string) => `xvm:credential:${userId}`
const local = new Map<string, StoredCredential>()

async function read(userId: string): Promise<StoredCredential | null> {
  if (ready() && redis) {
    try {
      const raw = await redis.get(key(userId))
      return raw === null ? null : (JSON.parse(raw) as StoredCredential)
    } catch (error) {
      console.error("[xvm-api-store] redis read failed:", error)
    }
  }
  return local.get(userId) ?? null
}

async function write(userId: string, credential: StoredCredential): Promise<void> {
  local.set(userId, credential)
  if (!ready() || !redis) return
  try {
    await redis.set(key(userId), JSON.stringify(credential), "PX", Math.max(credential.expiresAt - Date.now(), 1))
  } catch (error) {
    console.error("[xvm-api-store] redis write failed:", error)
  }
}

export async function upsertXvmApiCredential(userId: string, issued: CredentialIssued): Promise<void> {
  if (!issued.credential.expires_at) {
    throw new Error("xvm-api credential is missing expires_at")
  }
  await write(userId, { token: issued.secret, expiresAt: new Date(issued.credential.expires_at).getTime() })
}

export async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const stored = await read(userId)
  if (!stored) return null
  if (stored.expiresAt - Date.now() < REFRESH_MARGIN_MS) return null
  return stored.token
}

export async function invalidateXvmApiCredential(userId: string): Promise<void> {
  local.delete(userId)
  if (!ready() || !redis) return
  try {
    await redis.del(key(userId))
  } catch (error) {
    console.error("[xvm-api-store] redis delete failed:", error)
  }
}

/**
 * True only for a genuine "xvm-api rejected this token" failure - a network
 * blip, timeout, or any other exception must never invalidate a credential
 * that might still be perfectly valid.
 */
export function isXvmAuthFailure(err: unknown): err is XvmApiError {
  return err instanceof XvmApiError && err.status === 401
}

/**
 * Standard catch-block response for a failed xvm-api call in a route handler:
 * a non-401 XvmApiError passes its status/message through as-is, a 401
 * invalidates the stored credential (the only case that should), and
 * anything else (network blip, DNS failure, etc.) logs and returns a
 * generic 503 without touching the credential.
 */
export async function xvmApiErrorResponse(err: unknown, userId: string, logLabel: string): Promise<NextResponse> {
  if (err instanceof XvmApiError && err.status !== 401) {
    return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
  }
  if (isXvmAuthFailure(err)) {
    console.error(`${logLabel}:`, err)
    await invalidateXvmApiCredential(userId)
    return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
  }
  console.error(`${logLabel}:`, err)
  return NextResponse.json({ error: "xvm-api request failed" }, { status: 503 })
}

/**
 * The signed-in user's xvm-api person id, lazily fetched via /me and cached
 * alongside the token on first use — avoids adding an xvm-api call to the
 * login/token-refresh path in lib/auth.ts, which deliberately never fails
 * login on xvm-api being down. Returns null if there's no valid token,
 * matching getValidXvmApiToken's contract.
 */
export async function getValidXvmApiPersonId(userId: string): Promise<number | null> {
  const token = await getValidXvmApiToken(userId)
  if (!token) return null

  const stored = await read(userId)
  if (stored?.personId != null) return stored.personId

  const me = await getMe(token)
  if (!me.person) return null

  if (stored) await write(userId, { ...stored, personId: me.person.id })
  return me.person.id
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
