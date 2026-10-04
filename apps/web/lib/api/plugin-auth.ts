import { nanoid } from "nanoid"
import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { User } from "@/generated/prisma/client"
import { enforcePluginIpRateLimit, enforcePluginRateLimit } from "@/lib/api/plugin-rate-limit"

/**
 * SHA-256 hash of an API key for storage + lookup. The plaintext key is
 * shown to the user once at creation; on every subsequent validation we
 * hash the incoming header and look up by `keyHash`. Plain SHA-256 (no
 * salt/HMAC) is sufficient because keys are 32-char nanoids = 192 bits of
 * entropy, beyond brute-force rainbow attacks even unsalted.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

/**
 * Generate a new API key for a user. Returns the raw key (shown once
 * at creation). Only the SHA-256 hash is persisted, plus a non-sensitive
 * keyPreview (first 8 + last 4 chars) for the dashboard listing.
 */
export async function generateApiKey(userId: string, name?: string, venueId?: string): Promise<string> {
  const key = `vm_${nanoid(32)}`
  const id = nanoid()
  const keyHash = hashApiKey(key)
  const keyPreview = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`

  await prisma.apiKey.create({
    data: {
      id,
      userId,
      keyHash,
      keyPreview,
      name: name || "Plugin API Key",
      venueId,
    },
  })

  return key
}

/**
 * Validate an API key and return the associated user
 */
export async function validateApiKey(apiKey: string): Promise<{
  userId: string | null
  user: User | null
  venues: string[]
} | null> {
  if (!apiKey || !apiKey.startsWith("vm_")) {
    return null
  }

  // Lookup by keyHash, never by plaintext. Combined with revokedAt: null
  // in the where clause so revoked keys don't even produce a record.
  const keyHash = hashApiKey(apiKey)
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    include: {
      user: true,
    },
  })

  if (!apiKeyRecord) {
    return null
  }

  // Fire-and-forget: bump lastUsedAt so the web UI shows when each key
  // was last seen. We intentionally do NOT await - swallowing errors and
  // not blocking validation keeps plugin requests fast.
  prisma.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {})

  // Get venues the user has access to
  const memberships = await prisma.membership.findMany({
    where: {
      userId: apiKeyRecord.userId,
      status: "active",
    },
    select: {
      venueId: true,
    },
  })

  const venues = memberships.map((m) => m.venueId)

  // If key has specific venue, only allow that one
  if (apiKeyRecord.venueId) {
    if (!venues.includes(apiKeyRecord.venueId)) {
      return null
    }
    return {
      userId: apiKeyRecord.userId,
      user: apiKeyRecord.user,
      venues: [apiKeyRecord.venueId],
    }
  }

  return {
    userId: apiKeyRecord.userId,
    user: apiKeyRecord.user,
    venues,
  }
}

export type PluginAuth = {
  userId: string
  venues: string[]
  user: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>["user"]
}

export type PluginAuthGateResult = { ok: true; auth: PluginAuth } | { ok: false; response: NextResponse }

/**
 * Shared preamble for every /api/plugin/* route: per-IP throttle, API-key
 * presence check, key validation, per-key throttle. Kept out of each
 * route's own try/catch on purpose - callers unwrap this before their own
 * business-logic try/catch begins, so their existing per-route error
 * messages and Zod-validation branches are untouched by this helper.
 */
export async function pluginAuthGate(request: NextRequest, kind: "read" | "write"): Promise<PluginAuthGateResult> {
  const ipLimited = await enforcePluginIpRateLimit(request)
  if (ipLimited) return { ok: false, response: ipLimited }

  const apiKey = request.headers.get("x-api-key")
  if (!apiKey) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const auth = await validateApiKey(apiKey)
  if (!auth || !auth.userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const limited = await enforcePluginRateLimit(apiKey, kind)
  if (limited) return { ok: false, response: limited }

  return { ok: true, auth: { userId: auth.userId, venues: auth.venues, user: auth.user } }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get user's API keys
 */
export async function getUserApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: {
      userId,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Get venues accessible by a user (based on their memberships)
 */
export async function getUserVenues(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "active",
    },
    include: {
      venue: true,
    },
  })

  return memberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    slug: m.venue.slug,
    role: m.role,
  }))
}

/**
 * Check if a user can perform an action at a venue
 */
export async function checkPermission(
  userId: string,
  venueId: string,
  action: "view" | "log_service" | "log_transaction" | "log_patron" | "view_shifts" | "clock_shift" | "toggle_room"
): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: "active",
    },
  })

  if (!membership) {
    return false
  }

  // OWNER and MANAGER can do everything
  if (membership.role === "OWNER" || membership.role === "MANAGER") {
    return true
  }

  // STAFF can log services, patron visits, and transactions (sales).
  // Aligned with the web transactions POST route, which only checks for
  // active membership - any active member can log a sale from either
  // surface.
  if (membership.role === "STAFF") {
    return (
      action === "log_service" ||
      action === "log_patron" ||
      action === "log_transaction" ||
      action === "view_shifts" ||
      action === "clock_shift" ||
      action === "toggle_room"
    )
  }

  return false
}
