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
    const odd = [
      { ...character, lodestone_id: 11865953 },
      { ...character, lodestone_id: "1e3" },
      { ...character, lodestone_id: "-5" },
      { ...character, name: "x".repeat(33) },
      { ...character, home_world: 7 },
      { ...character, persistent_key: "k".repeat(65) },
      { ...character, verified_at: null },
      null,
    ]
    expect(toVerifiedCharacters(odd as never)).toEqual([])
    const many = Array.from({ length: 150 }, (_, i) => ({ ...character, lodestone_id: String(i + 1), persistent_key: `k${i}` }))
    expect(toVerifiedCharacters(many)).toHaveLength(100)
  })
})
