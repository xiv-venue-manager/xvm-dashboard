import { createHash, randomBytes } from "node:crypto"
import type { VerifiedCharacterInput } from "@/lib/api/xvm-api"

export const XIVAUTH_AUTHORIZE_URL = "https://xivauth.net/oauth/authorize"
export const XIVAUTH_TOKEN_URL = "https://xivauth.net/oauth/token"
export const XIVAUTH_CHARACTERS_URL = "https://xivauth.net/api/v1/characters"
export const XIVAUTH_SCOPE = "character:all"
export const FLOW_COOKIE = "xivauth_flow"
export const FLOW_COOKIE_MAX_AGE_SECONDS = 600
const MAX_CHARACTERS = 100
const MAX_TEXT_LENGTH = 32
const MAX_KEY_LENGTH = 128

export class XivAuthError extends Error {}

export interface XivAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface XivAuthCharacter {
  persistent_key: string
  lodestone_id: string
  name: string
  home_world: string
  data_center: string
  verified_at: string | null
}

export function siteUrl(): URL {
  return new URL(process.env.NEXTAUTH_URL || "http://localhost:3000")
}

export function xivauthConfig(): XivAuthConfig | null {
  const clientId = process.env.XIVAUTH_CLIENT_ID
  const clientSecret = process.env.XIVAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: new URL("/api/xivauth/callback", siteUrl()).toString() }
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url")
  return { verifier, challenge: challengeFor(verifier) }
}

export function createState(): string {
  return randomBytes(16).toString("base64url")
}

export function buildAuthorizeUrl(config: XivAuthConfig, state: string, challenge: string): string {
  const url = new URL(XIVAUTH_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: XIVAUTH_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString()
  return url.toString()
}

export async function exchangeCode(config: XivAuthConfig, code: string, verifier: string): Promise<string> {
  const res = await fetch(XIVAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }).toString(),
  })
  if (!res.ok) throw new XivAuthError(`token exchange failed: ${res.status}`)
  const body = (await res.json().catch(() => null)) as { access_token?: unknown } | null
  if (!body || typeof body.access_token !== "string" || !body.access_token) {
    throw new XivAuthError("token response had no access_token")
  }
  return body.access_token
}

export async function fetchSharedCharacters(accessToken: string): Promise<XivAuthCharacter[]> {
  const res = await fetch(XIVAUTH_CHARACTERS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!res.ok) throw new XivAuthError(`characters request failed: ${res.status}`)
  const body: unknown = await res.json().catch(() => null)
  if (!Array.isArray(body)) throw new XivAuthError("characters response was not a list")
  return body as XivAuthCharacter[]
}

const isText = (value: unknown, max = MAX_TEXT_LENGTH): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max

export function toVerifiedCharacters(list: XivAuthCharacter[]): VerifiedCharacterInput[] {
  return list
    .flatMap((c) => {
      if (!c || typeof c.lodestone_id !== "string" || !/^\d{1,15}$/.test(c.lodestone_id)) return []
      const lodestoneId = Number(c.lodestone_id)
      if (lodestoneId < 1 || !isText(c.persistent_key, MAX_KEY_LENGTH) || !isText(c.name) || !isText(c.home_world)) return []
      return [{ lodestone_id: lodestoneId, xivauth_key: c.persistent_key, character_name: c.name, world: c.home_world }]
    })
    .slice(0, MAX_CHARACTERS)
}
