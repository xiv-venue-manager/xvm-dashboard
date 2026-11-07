# XIV Auth Verified Characters: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person can prove the characters they own through XIV Auth from the dashboard's characters page, and the result is recorded in xvm-api and shown as a verified mark.

**Architecture:** Two server routes under `app/api/xivauth/`. `start` makes a `state` and a PKCE pair, keeps them in a 10 minute httpOnly cookie, and redirects to XIV Auth asking only for `character:all`. `callback` checks the cookie, exchanges the code, reads the shared characters, and relays them to xvm-api's `POST /internal/characters/verified` with the dashboard service credential. It redirects back to the characters page with a short result in the query string. All XIV Auth calls are server side, so the content security policy does not change.

**Tech Stack:** Next.js route handlers, TypeScript strict, vitest, `node:crypto`. No new dependencies.

Spec: `docs/superpowers/specs/2026-11-07-xivauth-character-verification-design.md`. Depends on the xvm-api half (`2026-11-07-xivauth-xvm-api-endpoint.md`) being merged and deployed before this is switched on. The code can be built and tested first because every xvm-api call is mocked.

**Ships after the 2026-11-10 cutover.** Per this repo's CLAUDE.md, real code goes in its own worktree and branch. Verify with `tsc --noEmit`, `pnpm run lint` and `vitest run`, then a live check.

---

## File Structure

- Create `apps/web/lib/api/xivauth.ts`: XIV Auth URLs, PKCE, config, authorize URL, code exchange, character fetch, mapping.
- Create `apps/web/lib/api/xivauth.test.ts`.
- Create `apps/web/lib/api/xivauth-result.ts`: turns the callback's query string into a message.
- Create `apps/web/lib/api/xivauth-result.test.ts`.
- Modify `apps/web/lib/api/xvm-api.ts`: `verified_via` on `MyCharacterRow`; `recordVerifiedCharacters`.
- Create `apps/web/lib/api/xvm-api-verified.test.ts`.
- Modify `apps/web/lib/api/character-shape.ts` and its test: `verifiedVia`.
- Modify `apps/web/app/api/user-characters/route.test.ts`: the `row()` helper gains `verified_via`.
- Create `apps/web/app/api/xivauth/start/route.ts` and `route.test.ts`.
- Create `apps/web/app/api/xivauth/callback/route.ts` and `route.test.ts`.
- Modify `apps/web/app/dashboard/account/characters/page.tsx`: Verify button, verified badge, result notice.
- Modify `apps/web/.env.example`, `docs/SHARED_ASSETS.md`.

## Before any code: register the XIV Auth client

This has the longest lead time (some scopes may need an access review), so start it first. In the XIV Auth Developer Portal create an OAuth client with:

- Redirect URIs: `https://xivvenuemanager.com/api/xivauth/callback`, `https://dev.xivvenuemanager.com/api/xivauth/callback`, `http://localhost:3000/api/xivauth/callback`.
- Scope: `character:all`.
- Keep the client id and secret out of chat and out of git.

## Task 1: XIV Auth helpers

**Files:**
- Create: `apps/web/lib/api/xivauth.ts`
- Test: `apps/web/lib/api/xivauth.test.ts`

- [ ] **Step 1: Branch**

```bash
cd ~/xvm-dashboard && git fetch origin dev && git worktree add -b feat/xivauth-characters ~/xvm-dashboard-xivauth-build origin/dev && cd ~/xvm-dashboard-xivauth-build/apps/web
```

- [ ] **Step 2: Write the failing tests**

Create `lib/api/xivauth.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest"
import {
  XivAuthError,
  buildAuthorizeUrl,
  challengeFor,
  createPkcePair,
  exchangeCode,
  fetchSharedCharacters,
  toVerifiedCharacters,
  xivauthConfig,
} from "./xivauth"

const config = { clientId: "cid", clientSecret: "secret", redirectUri: "https://site.test/api/xivauth/callback" }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("PKCE", () => {
  it("matches the RFC 7636 example", () => {
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  it("makes a fresh verifier whose challenge is derived from it", () => {
    const a = createPkcePair()
    const b = createPkcePair()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).toBe(challengeFor(a.verifier))
    expect(a.verifier.length).toBeGreaterThanOrEqual(43)
  })
})

describe("xivauthConfig", () => {
  it("is null until both settings exist", () => {
    vi.stubEnv("XIVAUTH_CLIENT_ID", "")
    vi.stubEnv("XIVAUTH_CLIENT_SECRET", "")
    expect(xivauthConfig()).toBeNull()
  })

  it("builds the redirect URI from the site's own URL", () => {
    vi.stubEnv("XIVAUTH_CLIENT_ID", "cid")
    vi.stubEnv("XIVAUTH_CLIENT_SECRET", "secret")
    vi.stubEnv("NEXTAUTH_URL", "https://dev.xivvenuemanager.com")
    expect(xivauthConfig()).toEqual({
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "https://dev.xivvenuemanager.com/api/xivauth/callback",
    })
  })
})

describe("buildAuthorizeUrl", () => {
  it("asks only for character:all, with state and an S256 challenge", () => {
    const url = new URL(buildAuthorizeUrl(config, "st", "ch"))
    expect(url.origin + url.pathname).toBe("https://xivauth.net/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: config.redirectUri,
      scope: "character:all",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    })
  })
})

describe("exchangeCode", () => {
  it("posts the code with the verifier and returns the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await exchangeCode(config, "code-1", "verifier-1")).toBe("tok")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://xivauth.net/oauth/token")
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: config.redirectUri,
      client_id: "cid",
      client_secret: "secret",
      code_verifier: "verifier-1",
    })
  })

  it("throws when XIV Auth refuses or sends no token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 400 })))
    await expect(exchangeCode(config, "c", "v")).rejects.toBeInstanceOf(XivAuthError)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })))
    await expect(exchangeCode(config, "c", "v")).rejects.toBeInstanceOf(XivAuthError)
  })
})

describe("fetchSharedCharacters", () => {
  it("reads the list with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ persistent_key: "k" }]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchSharedCharacters("tok")).toEqual([{ persistent_key: "k" }])
    expect(fetchMock.mock.calls[0][0]).toBe("https://xivauth.net/api/v1/characters")
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok")
  })

  it("throws on a failure or a body that is not a list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })))
    await expect(fetchSharedCharacters("tok")).rejects.toBeInstanceOf(XivAuthError)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 })))
    await expect(fetchSharedCharacters("tok")).rejects.toBeInstanceOf(XivAuthError)
  })
})

describe("toVerifiedCharacters", () => {
  const character = {
    persistent_key: "A6MHlk4JaKJnseI1lxUexaoNyB3",
    lodestone_id: "11865953",
    name: "M'naago Rahz",
    home_world: "The Peering Stones",
    data_center: "Ala Mhigo",
    verified_at: "2025-03-11T06:21:04.436Z",
  }

  it("turns the Lodestone id into a number and renames the fields", () => {
    expect(toVerifiedCharacters([character])).toEqual([
      { lodestone_id: 11865953, xivauth_key: "A6MHlk4JaKJnseI1lxUexaoNyB3", character_name: "M'naago Rahz", world: "The Peering Stones" },
    ])
  })

  it("drops entries xvm-api would refuse, and stops at 100", () => {
    const bad = [{ ...character, lodestone_id: "abc" }, { ...character, lodestone_id: "0" }, { ...character, name: "" }, { ...character, persistent_key: "" }]
    expect(toVerifiedCharacters(bad)).toEqual([])
    const many = Array.from({ length: 150 }, (_, i) => ({ ...character, lodestone_id: String(i + 1), persistent_key: `k${i}` }))
    expect(toVerifiedCharacters(many)).toHaveLength(100)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm exec vitest run lib/api/xivauth.test.ts`
Expected: FAIL, `Failed to resolve import "./xivauth"`.

- [ ] **Step 4: Write the helpers**

Create `lib/api/xivauth.ts`:

```ts
import { createHash, randomBytes } from "node:crypto"
import type { VerifiedCharacterInput } from "@/lib/api/xvm-api"

export const XIVAUTH_AUTHORIZE_URL = "https://xivauth.net/oauth/authorize"
export const XIVAUTH_TOKEN_URL = "https://xivauth.net/oauth/token"
export const XIVAUTH_CHARACTERS_URL = "https://xivauth.net/api/v1/characters"
export const XIVAUTH_SCOPE = "character:all"
export const FLOW_COOKIE = "xivauth_flow"
export const FLOW_COOKIE_MAX_AGE_SECONDS = 600
const MAX_CHARACTERS = 100

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

export function toVerifiedCharacters(list: XivAuthCharacter[]): VerifiedCharacterInput[] {
  return list
    .flatMap((c) => {
      const lodestoneId = Number(c.lodestone_id)
      if (!Number.isSafeInteger(lodestoneId) || lodestoneId < 1 || !c.persistent_key || !c.name || !c.home_world) return []
      return [{ lodestone_id: lodestoneId, xivauth_key: c.persistent_key, character_name: c.name, world: c.home_world }]
    })
    .slice(0, MAX_CHARACTERS)
}
```

- [ ] **Step 5: Add the xvm-api input type the helper imports**

In `lib/api/xvm-api.ts`, after `MyCharacterRow` (the `// ── My characters` section) add:

```ts
export interface VerifiedCharacterInput {
  lodestone_id: number
  xivauth_key: string
  character_name: string
  world: string
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run lib/api/xivauth.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add lib/api/xivauth.ts lib/api/xivauth.test.ts lib/api/xvm-api.ts
git commit -m "feat: helpers for proving characters through XIV Auth

PKCE, the authorize URL asking only for character:all, the code exchange and the
character list, mapped to what xvm-api records."
```

## Task 2: The xvm-api call and the verified mark in the shape

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`
- Create: `apps/web/lib/api/xvm-api-verified.test.ts`
- Modify: `apps/web/lib/api/character-shape.ts`, `character-shape.test.ts`
- Modify: `apps/web/app/api/user-characters/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/api/xvm-api-verified.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("recordVerifiedCharacters", () => {
  it("posts the person and characters with the dashboard service credential", async () => {
    vi.stubEnv("XVM_API_DASHBOARD_SERVICE_TOKEN", "service-token")
    vi.resetModules()
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ outcome: "created" }]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const { recordVerifiedCharacters } = await import("./xvm-api")
    const characters = [{ lodestone_id: 1, xivauth_key: "k", character_name: "Aa Bb", world: "Lich" }]
    expect(await recordVerifiedCharacters(42, characters)).toEqual([{ outcome: "created" }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("http://xvm-api.test/internal/characters/verified")
    expect(init.method).toBe("POST")
    expect(init.headers.Authorization).toBe("Bearer service-token")
    expect(JSON.parse(init.body)).toEqual({ person_id: 42, characters })
  })

  it("refuses to run without the service credential", async () => {
    vi.stubEnv("XVM_API_DASHBOARD_SERVICE_TOKEN", "")
    vi.resetModules()
    const { recordVerifiedCharacters } = await import("./xvm-api")
    await expect(recordVerifiedCharacters(1, [])).rejects.toThrow("XVM_API_DASHBOARD_SERVICE_TOKEN is not set")
  })
})
```

Replace the first `it` in `lib/api/character-shape.test.ts` with:

```ts
  it("maps an xvm-api character to the shape the characters page reads", () => {
    expect(toCharacterShape({ id: 7, character_name: "Test Char", world: "Lich", is_primary: true, verified_via: "xivauth" })).toEqual({
      id: "7",
      characterName: "Test Char",
      world: "Lich",
      isPrimary: true,
      verifiedVia: "xivauth",
    })
  })
```

In `app/api/user-characters/route.test.ts`, add `verified_via: "self_declared",` to the object returned by the `row()` helper (after `is_primary: true,`), and change the expected JSON in `returns the characters in the shape the characters page reads` so each character also has `verifiedVia: "self_declared"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run lib/api/xvm-api-verified.test.ts lib/api/character-shape.test.ts app/api/user-characters/route.test.ts`
Expected: FAIL (`recordVerifiedCharacters is not a function`, and the shape lacks `verifiedVia`).

- [ ] **Step 3: Implement**

In `lib/api/xvm-api.ts` change `MyCharacterRow` and add the call and outcome type after `VerifiedCharacterInput`:

```ts
export interface MyCharacterRow {
  id: number
  character_name: string
  world: string
  is_primary: boolean
  verified_via: string
}

export interface VerifiedCharacterOutcome {
  character_name: string
  world: string
  lodestone_id: number
  outcome: "created" | "verified" | "transferred" | "conflict"
  character_id: number | null
  detail: string | null
}

export async function recordVerifiedCharacters(
  personId: number,
  characters: VerifiedCharacterInput[]
): Promise<VerifiedCharacterOutcome[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (!process.env.XVM_API_DASHBOARD_SERVICE_TOKEN) throw new Error("XVM_API_DASHBOARD_SERVICE_TOKEN is not set")
  return xvmFetch<VerifiedCharacterOutcome[]>(
    "/internal/characters/verified",
    { method: "POST", body: JSON.stringify({ person_id: personId, characters }) },
    XVM_API_DASHBOARD_SERVICE_TOKEN
  )
}
```

In `lib/api/character-shape.ts` add `verifiedVia: string` to `CharacterShape` and `verifiedVia: row.verified_via,` to the returned object.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm exec vitest run lib/api app/api/user-characters && pnpm exec tsc --noEmit`
Expected: PASS. If `tsc` reports other places that build a `MyCharacterRow`, add `verified_via` there.

- [ ] **Step 5: Commit**

```bash
git add lib/api app/api/user-characters
git commit -m "feat: relay verified characters to xvm-api, and carry how each was verified

recordVerifiedCharacters uses the dashboard service credential, which is the only
credential xvm-api accepts for it."
```

## Task 3: The result message

**Files:**
- Create: `apps/web/lib/api/xivauth-result.ts`, `xivauth-result.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/api/xivauth-result.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { describeXivAuthResult } from "./xivauth-result"

describe("describeXivAuthResult", () => {
  it("says nothing when the page was not reached from XIV Auth", () => {
    expect(describeXivAuthResult("")).toBeNull()
    expect(describeXivAuthResult("?tab=1")).toBeNull()
  })

  it("counts what happened", () => {
    expect(describeXivAuthResult("?xivauth=done&verified=2&transferred=1&conflicts=0")).toEqual({
      tone: "success",
      message: "Verified 3 characters. 1 was taken over from an account that had linked it without proof.",
    })
    expect(describeXivAuthResult("?xivauth=done&verified=1&transferred=0&conflicts=0")).toEqual({
      tone: "success",
      message: "Verified 1 character.",
    })
  })

  it("is an error when nothing could be verified", () => {
    expect(describeXivAuthResult("?xivauth=done&verified=0&transferred=0&conflicts=2")).toEqual({
      tone: "error",
      message: "None could be verified. 2 are already verified on another account.",
    })
  })

  it("explains each way the flow can stop", () => {
    expect(describeXivAuthResult("?xivauth=denied")?.message).toMatch(/did not allow/)
    expect(describeXivAuthResult("?xivauth=none")?.message).toMatch(/did not share any characters/)
    expect(describeXivAuthResult("?xivauth=state")?.message).toMatch(/expired/)
    expect(describeXivAuthResult("?xivauth=unavailable")?.message).toMatch(/not set up/)
    expect(describeXivAuthResult("?xivauth=error")?.tone).toBe("error")
    expect(describeXivAuthResult("?xivauth=whatever")?.tone).toBe("error")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/api/xivauth-result.test.ts`
Expected: FAIL, cannot resolve `./xivauth-result`.

- [ ] **Step 3: Implement**

Create `lib/api/xivauth-result.ts`:

```ts
export interface XivAuthNotice {
  tone: "success" | "error"
  message: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeXivAuthResult(search: string): XivAuthNotice | null {
  const params = new URLSearchParams(search)
  const status = params.get("xivauth")
  if (!status) return null
  const count = (key: string) => Number(params.get(key)) || 0

  switch (status) {
    case "done": {
      const verified = count("verified")
      const transferred = count("transferred")
      const conflicts = count("conflicts")
      const total = verified + transferred
      if (total === 0) {
        return { tone: "error", message: `None could be verified. ${conflicts} ${conflicts === 1 ? "is" : "are"} already verified on another account.` }
      }
      const parts = [`Verified ${plural(total, "character", "characters")}.`]
      if (transferred > 0) {
        parts.push(`${transferred} ${transferred === 1 ? "was" : "were"} taken over from an account that had linked ${transferred === 1 ? "it" : "them"} without proof.`)
      }
      if (conflicts > 0) {
        parts.push(`${conflicts} could not be verified because ${conflicts === 1 ? "it is" : "they are"} already verified on another account.`)
      }
      return { tone: "success", message: parts.join(" ") }
    }
    case "denied":
      return { tone: "error", message: "You did not allow access on XIV Auth, so nothing was verified." }
    case "none":
      return { tone: "error", message: "XIV Auth did not share any characters. Share at least one verified character there and try again." }
    case "state":
      return { tone: "error", message: "That sign-in expired or did not start here. Please try again." }
    case "unavailable":
      return { tone: "error", message: "Verification with XIV Auth is not set up yet." }
    default:
      return { tone: "error", message: "Something went wrong talking to XIV Auth. Please try again." }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run lib/api/xivauth-result.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xivauth-result.ts lib/api/xivauth-result.test.ts
git commit -m "feat: say what a verify attempt did"
```

## Task 4: The start route

**Files:**
- Create: `apps/web/app/api/xivauth/start/route.ts`, `route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/xivauth/start/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("XIVAUTH_CLIENT_ID", "cid")
  vi.stubEnv("XIVAUTH_CLIENT_SECRET", "secret")
  vi.stubEnv("NEXTAUTH_URL", "https://site.test")
  m.session.mockResolvedValue({ user: { id: "user-1" } })
})

describe("GET /api/xivauth/start", () => {
  it("sends a signed-out visitor to sign in", async () => {
    m.session.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://site.test/auth/signin")
  })

  it("goes back to the characters page when verification is not set up", async () => {
    vi.stubEnv("XIVAUTH_CLIENT_ID", "")
    const res = await GET()
    expect(res.headers.get("location")).toBe("https://site.test/dashboard/account/characters?xivauth=unavailable")
  })

  it("redirects to XIV Auth with state and a challenge, keeping the verifier only in an httpOnly cookie", async () => {
    const res = await GET()
    const location = new URL(res.headers.get("location")!)
    expect(location.origin + location.pathname).toBe("https://xivauth.net/oauth/authorize")
    const state = location.searchParams.get("state")!
    expect(state.length).toBeGreaterThan(10)
    expect(location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(location.searchParams.get("scope")).toBe("character:all")

    const cookie = res.cookies.get("xivauth_flow")!
    const flow = JSON.parse(cookie.value) as { state: string; verifier: string }
    expect(flow.state).toBe(state)
    expect(location.search).not.toContain(flow.verifier)
    const header = res.headers.get("set-cookie")!
    expect(header).toContain("HttpOnly")
    expect(header).toContain("Max-Age=600")
    expect(header).toContain("Path=/api/xivauth")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run app/api/xivauth/start`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `app/api/xivauth/start/route.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run app/api/xivauth/start`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/xivauth/start
git commit -m "feat: start proving characters with XIV Auth

The verifier stays in a 10 minute httpOnly cookie and never appears in the URL."
```

## Task 5: The callback route

**Files:**
- Create: `apps/web/app/api/xivauth/callback/route.ts`, `route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/xivauth/callback/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  personId: vi.fn(),
  record: vi.fn(),
  exchange: vi.fn(),
  characters: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/xvm-api-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api-store")>()),
  getValidXvmApiPersonId: m.personId,
}))
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  recordVerifiedCharacters: m.record,
}))
vi.mock("@/lib/api/xivauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xivauth")>()),
  exchangeCode: m.exchange,
  fetchSharedCharacters: m.characters,
}))

import { GET } from "./route"
import { XivAuthError } from "@/lib/api/xivauth"
import { XvmApiError } from "@/lib/api/xvm-api"

const shared = { persistent_key: "k", lodestone_id: "11865953", name: "Aa Bb", home_world: "Lich", data_center: "Light", verified_at: "x" }
const flow = encodeURIComponent(JSON.stringify({ state: "st", verifier: "ver" }))

const call = (query: string, cookie: string | null = `xivauth_flow=${flow}`) =>
  GET(new NextRequest(`https://site.test/api/xivauth/callback${query}`, { headers: cookie ? { cookie } : {} }))
const back = (res: Response) => new URL(res.headers.get("location")!)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubEnv("XIVAUTH_CLIENT_ID", "cid")
  vi.stubEnv("XIVAUTH_CLIENT_SECRET", "secret")
  vi.stubEnv("NEXTAUTH_URL", "https://site.test")
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.personId.mockResolvedValue(42)
  m.exchange.mockResolvedValue("access")
  m.characters.mockResolvedValue([shared])
  m.record.mockResolvedValue([{ outcome: "created" }])
})

describe("GET /api/xivauth/callback", () => {
  it("sends a signed-out visitor to sign in", async () => {
    m.session.mockResolvedValue(null)
    expect(back(await call("?code=c&state=st")).pathname).toBe("/auth/signin")
  })

  it("records the characters and reports the counts, clearing the flow cookie", async () => {
    m.record.mockResolvedValue([{ outcome: "created" }, { outcome: "verified" }, { outcome: "transferred" }, { outcome: "conflict" }])
    const res = await call("?code=c&state=st")
    expect(m.exchange).toHaveBeenCalledWith(expect.objectContaining({ clientId: "cid" }), "c", "ver")
    expect(m.characters).toHaveBeenCalledWith("access")
    expect(m.record).toHaveBeenCalledWith(42, [
      { lodestone_id: 11865953, xivauth_key: "k", character_name: "Aa Bb", world: "Lich" },
    ])
    const to = back(res)
    expect(to.pathname).toBe("/dashboard/account/characters")
    expect(Object.fromEntries(to.searchParams)).toEqual({ xivauth: "done", verified: "2", transferred: "1", conflicts: "1" })
    expect(res.headers.get("set-cookie")).toMatch(/xivauth_flow=;.*Max-Age=0/)
  })

  it("reports a denial without calling XIV Auth", async () => {
    const res = await call("?error=access_denied&state=st")
    expect(back(res).searchParams.get("xivauth")).toBe("denied")
    expect(m.exchange).not.toHaveBeenCalled()
  })

  it.each([
    ["no flow cookie", "?code=c&state=st", null],
    ["a different state", "?code=c&state=other", `xivauth_flow=${flow}`],
    ["no code", "?state=st", `xivauth_flow=${flow}`],
    ["an unreadable cookie", "?code=c&state=st", "xivauth_flow=not-json"],
  ])("refuses %s", async (_label, query, cookie) => {
    const res = await call(query, cookie)
    expect(back(res).searchParams.get("xivauth")).toBe("state")
    expect(m.exchange).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
  })

  it("says so when XIV Auth shared nothing usable", async () => {
    m.characters.mockResolvedValue([])
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("none")
    expect(m.record).not.toHaveBeenCalled()
  })

  it("reports an error when XIV Auth or xvm-api fails, or there is no xvm-api link", async () => {
    m.exchange.mockRejectedValueOnce(new XivAuthError("token exchange failed: 400"))
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
    m.record.mockRejectedValueOnce(new XvmApiError(503, "down"))
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
    m.personId.mockResolvedValueOnce(null)
    expect(back(await call("?code=c&state=st")).searchParams.get("xivauth")).toBe("error")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run app/api/xivauth/callback`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `app/api/xivauth/callback/route.ts`:

```ts
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

function finish(params: Record<string, string>): NextResponse {
  const url = new URL("/dashboard/account/characters", siteUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = NextResponse.redirect(url)
  response.cookies.set(FLOW_COOKIE, "", { httpOnly: true, path: "/api/xivauth", maxAge: 0 })
  return response
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.redirect(new URL("/auth/signin", siteUrl()))

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run app/api/xivauth`
Expected: PASS (start and callback).

- [ ] **Step 5: Commit**

```bash
git add app/api/xivauth/callback
git commit -m "feat: finish proving characters with XIV Auth

Checks the state in constant time, exchanges the code, relays the shared characters
to xvm-api and goes back to the characters page with the counts."
```

## Task 6: The characters page

**Files:**
- Modify: `apps/web/app/dashboard/account/characters/page.tsx`

- [ ] **Step 1: Add the import and the type**

At the top of the file, after the existing `Alert` import, add:

```tsx
import { describeXivAuthResult, type XivAuthNotice } from "@/lib/api/xivauth-result"
```

Change the `UserCharacter` interface to:

```tsx
interface UserCharacter {
  id: string
  characterName: string
  world: string
  isPrimary: boolean
  verifiedVia: string
}
```

- [ ] **Step 2: Read the result once, then clean the URL**

Inside `CharactersPage`, next to the other `useState` calls, add:

```tsx
  const [notice, setNotice] = useState<XivAuthNotice | null>(null)
```

and add this effect after the existing mount effect:

```tsx
  useEffect(() => {
    const found = describeXivAuthResult(window.location.search)
    if (!found) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice(found)
    window.history.replaceState(null, "", window.location.pathname)
  }, [])
```

If the project's lint config does not report that rule, delete the disable line; do not leave an unused directive.

- [ ] **Step 3: Show the notice and the Verify button**

After the existing `{success && (...)}` alert block add:

```tsx
      {notice && (
        <Alert
          variant={notice.tone === "error" ? "destructive" : "default"}
          className={notice.tone === "success" ? "mb-6 border-emerald-500/40 bg-emerald-500/10" : "mb-6"}
        >
          <AlertDescription className={notice.tone === "success" ? "text-emerald-300" : undefined}>
            {notice.message}
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Verify with XIV Auth</CardTitle>
          <CardDescription>
            Prove you own your characters. You choose which ones to share on XIV Auth, and a verified character cannot be
            taken by anyone else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/api/xivauth/start">Verify with XIV Auth</a>
          </Button>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Show the mark on each character**

Inside the list item, directly after the `{c.isPrimary && (...)}` block, add:

```tsx
                    {c.verifiedVia === "xivauth" ? (
                      <Badge variant="outline" className="border-sky-500/40 text-sky-300">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Not verified
                      </Badge>
                    )}
```

- [ ] **Step 5: Typecheck, lint and test**

Run: `pnpm exec tsc --noEmit && pnpm run lint && pnpm exec vitest run`
Expected: tsc clean, lint with 0 errors (the repo's usual warnings only), all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/account/characters/page.tsx
git commit -m "feat: verify characters from the characters page

A Verify with XIV Auth button, a verified mark on each character, and what the last
attempt did."
```

## Task 7: Settings and docs

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `docs/SHARED_ASSETS.md`

- [ ] **Step 1: Add the settings to the example file**

Append to `apps/web/.env.example`:

```
# XIV Auth (proving which characters a person owns). Register an OAuth client in the XIV Auth
# developer portal with redirect URIs for each site, scope character:all.
XIVAUTH_CLIENT_ID=
XIVAUTH_CLIENT_SECRET=
```

- [ ] **Step 2: Add the helper to the shared assets list**

In `docs/SHARED_ASSETS.md`, in the table under `## xvm-api layer (lib/api/)`, add a row in the same format as its neighbours:

```
| `xivauth` (`xivauthConfig`, `createPkcePair`, `buildAuthorizeUrl`, `exchangeCode`, `fetchSharedCharacters`, `toVerifiedCharacters`) | Talking to XIV Auth: PKCE, the authorize URL, the code exchange and the shared character list |
```

- [ ] **Step 3: Commit**

```bash
git add .env.example ../../docs/SHARED_ASSETS.md
git commit -m "docs: the XIV Auth settings and helper"
```

## Task 8: Live check, then the pull request

Needs the registered XIV Auth client and the xvm-api endpoint deployed to the environment you test on.

- [ ] **Step 1: Set the two settings in the local environment**

Add `XIVAUTH_CLIENT_ID` and `XIVAUTH_CLIENT_SECRET` to `apps/web/.env.local` (never committed), with `NEXTAUTH_URL=http://localhost:3000`, and run against a local xvm-api that has the endpoint: `pnpm dev`.

- [ ] **Step 2: Click through**

Sign in, open `/dashboard/account/characters`, click Verify with XIV Auth, approve one character. Expected: back on the page with "Verified 1 character." and a Verified mark on it; an unlinked character appears in the list.

- [ ] **Step 3: Check each stop**

Deny access on XIV Auth (expect the "did not allow" message); share nothing (expect "did not share any characters"); open `/api/xivauth/callback?code=x&state=y` by hand (expect "expired or did not start here"). Confirm the PKCE parameter name: XIV Auth's page lists `code_verifier` for the algorithm, which looks like a typo for the standard `code_challenge_method`. If authorization fails for that reason, change only that one parameter in `buildAuthorizeUrl` and its test.

- [ ] **Step 4: Open the pull request against `dev`**

```bash
git push -u origin feat/xivauth-characters
gh pr create --base dev --title "Verify characters with XIV Auth" --body "A Verify with XIV Auth button on the characters page. The dashboard asks XIV Auth only for character:all, reads the characters the person shares, and relays them to xvm-api's POST /internal/characters/verified. Spec: docs/superpowers/specs/2026-11-07-xivauth-character-verification-design.md. Needs the xvm-api change (record verified characters) merged and deployed first, and XIVAUTH_CLIENT_ID and XIVAUTH_CLIENT_SECRET set in the environment. Ships after the 2026-11-10 cutover."
```
Expected: PR URL printed. Do not merge before the cutover.

## Rollout order

1. Register the XIV Auth client now.
2. After the cutover: merge the xvm-api PR and deploy xvm-api (the migration adds the column and indexes).
3. Set `XIVAUTH_CLIENT_ID` and `XIVAUTH_CLIENT_SECRET` on the dev web container, then this PR, then test on the dev site.
4. Promote to production and set the same two settings on `venue-manager`.
