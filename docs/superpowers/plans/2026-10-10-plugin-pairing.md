# Plugin Pairing (Direct to xvm-api) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can link the Dalamud plugin to their account with a one-time code, and the plugin ends up holding an account-wide xvm-api credential that it has verified with `GET /me`.

**Architecture:** The plugin calls xvm-api directly. The dashboard only issues the pairing code and lists and revokes linked plugins, using the person's own xvm-api token and no Prisma. The plugin exchanges the code at xvm-api's `POST /auth/pairing/exchange`, so xvm-api must be reachable from players' machines. That needs a public route (Tasks 1 to 3) and a correct per-IP rate limit behind Cloudflare (Task 2).

**Tech Stack:** Next.js route handlers and React, vitest (dashboard, `apps/web`); C# Dalamud plugin on .NET 10 with xunit (`xvm-plugin-dev`, private repo); FastAPI and pytest (xvm-api, owned by Allegro, one small draft PR); Cloudflare Tunnel.

**Status:** Draft for review. Nothing here has been built. This supersedes the unpushed draft `2026-10-09-plugin-cutover.md`, which assumed the dashboard forwards plugin calls.

---

## Decisions

| # | Decision | State |
|---|---|---|
| D1 | The plugin calls xvm-api directly. The dashboard no longer proxies plugin calls. | **Decided 2026-10-10** (user and Allegro) |
| D2 | One account-wide key per plugin install, issued with no `venue_id`. A venue-narrowed credential gets 403 from `GET /me/shifts`, so it could not drive the auto venue-switch or all-venue shift prompts. | Decided 2026-10-10 |
| D3 | Every plugin user relinks with a pairing code. Existing `vm_` keys are not imported. | Decided 2026-10-09 |
| D4 | A pairing credential carries no scopes. `platform_admin` is the only scope in xvm-api and a plugin key must not have it. | Decided (Allegro, 2026-10-10) |
| D5 | The existing `keys` routes and `vm_` keys stay untouched, so plugin versions already installed keep working. They are retired in a later plan. | Proposed |
| D6 | Nothing new reads or writes Prisma. | Standing rule |
| D7 | xvm-api is reachable from players at `https://api.xivvenuemanager.com`. | **Proposed**, confirmed or changed in Task 1 |
| D8 | Product rules for the later plans: clock-ins never change a venue's open or closed state, there is no early clock-in limit, and shift prompts are one click and never automatic. | Decided 2026-10-10 |

## What xvm-api provides (read from `origin/dev`, 2026-10-10)

- `POST /auth/pairing/codes` (a person credential) takes `{client: "plugin", venue_id: string | null}` and returns `{code, client, venue_id, expires_at}`.
- `POST /auth/pairing/exchange` (no auth, 10 per minute per client IP) takes `{code, client: "plugin"}` and returns `{secret, credential}`. It answers 400 for an unknown code, 409 for a used or expired code, 429 when rate limited.
- `GET /me` with `Authorization: Bearer <secret>` returns `{kind, client, name, venue_narrow, person: {id, display_name}, memberships: [{venue_id, tier}]}`.
- `GET /me/credentials` lists a person's credentials. `POST /me/credentials/{id}/revoke` revokes one. Both already have dashboard wrappers: `listMyCredentials` and `revokeCredential` in `apps/web/lib/api/xvm-api.ts`.
- The rate limiter (`src/api/rate_limit.py`) takes the client IP from the first `X-Forwarded-For` value. Its docstring says to revisit that if Cloudflare is ever put in front. Task 2 does.

## File structure

xvm-api (Allegro's repo, draft PR):
- Modify `src/api/settings.py`: one new setting, `CLIENT_IP_HEADER`.
- Modify `src/api/rate_limit.py`: read the client IP from that header when it is set.
- Create `Tests/test_rate_limit.py`.

Dashboard (`apps/web`):
- Modify `lib/api/xvm-api.ts`: `createPairingCode`.
- Create `lib/api/xvm-api-pairing.test.ts`.
- Create `app/api/plugin/pairing-codes/route.ts` and `route.test.ts`.
- Create `app/api/plugin/credentials/route.ts`, `route.test.ts`, `[credentialId]/route.ts` and `[credentialId]/route.test.ts`.
- Create `components/plugin-link-card.tsx`.
- Modify `app/dashboard/api-keys/page.tsx`: render the card.

Plugin (`xvm-plugin-dev`):
- Create `VenueManager/XvmApiPairing.cs`: the whole link flow, with no Dalamud dependency so it can be tested.
- Create `VenueManager.Tests/VenueManager.Tests.csproj` and `XvmApiPairingTests.cs`.
- Modify `VenueManager/Configuration.cs`: three fields.
- Modify `VenueManager/UI/Tabs/SettingsTab.cs`: the "Account link" section.

## Order

Tasks 1 and 2 come first and are the only ones that touch infrastructure. Task 3 opens the public route and must come after Task 2 is deployed. Tasks 4 to 7 (dashboard) and Tasks 8 and 9 (plugin) can then run in parallel. Task 10 checks everything together.

---

### Task 1: Agree how xvm-api is exposed

Read-only investigation plus one conversation. No production change yet.

**Files:** none.

- [ ] **Step 1: Ask Allegro these four questions** (they own xvm-api)

1. Is it fine to expose xvm-api at `https://api.xivvenuemanager.com` for the plugin?
2. Which xvm-api instance is production, and is there a Caddy or other proxy in front of it?
3. Should the public hostname expose every route, or only an allowlist (`/auth/pairing/exchange`, `/me`, `/venues/...`, `/patrons/...`, `/rooms/...`)? Every route already needs a credential, so the allowlist is optional hardening.
4. Is the draft PR in Task 2 (client IP from `CF-Connecting-IP`) an acceptable shape for the rate limit?

- [ ] **Step 2: Find the production upstream** (read-only)

Run:
```bash
ssh server@192.168.1.122 "docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Networks}}'"
```
Expected: one line for xvm-api and one for `cloudflared`. Write down xvm-api's container name, its internal port, and its Docker network, and whether `cloudflared` shares that network. Also run `docker ps | grep -i caddy` and write down whether Caddy fronts xvm-api.

- [ ] **Step 3: Read the tunnel's current routes** (read-only)

Run:
```bash
ssh server@192.168.1.122 'set -a; . /home/server/.xiv-env; set +a; curl -sS -H "Authorization: Bearer $CF_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" | python3 -m json.tool'
```
Expected: JSON whose `result.config.ingress` is a list ending in a catch-all `{"service": "http_status:404"}`. Never print the token. Note how the existing `xivvenuemanager.com` entry names its `service`, because the new entry copies that style.

- [ ] **Step 4: Record the answers** at the top of this task (hostname, upstream, whether Caddy is in front, allowlist or not) and commit the plan update.

```bash
git add docs/superpowers/plans/2026-10-10-plugin-pairing.md
git commit -m "docs: record how xvm-api is exposed for the plugin"
```

---

### Task 2: xvm-api reads the client IP from a configured header

Draft PR to xvm-api, for Allegro to reshape. Behind Cloudflare the rate limit key is wrong either way: through Caddy every player shares one bucket (Caddy replaces `X-Forwarded-For` with the tunnel's address), and straight to uvicorn the first `X-Forwarded-For` entry can be chosen by the caller. Cloudflare sets `CF-Connecting-IP` itself and a caller cannot override it. This adds a setting that says which header to trust, defaulting to today's behaviour.

**Files:**
- Modify: `src/api/settings.py`
- Modify: `src/api/rate_limit.py`
- Create: `Tests/test_rate_limit.py`

Work in a worktree: `cd ~/xvm-api && git fetch origin && git worktree add ~/xvm-api-clientip -b feat/client-ip-header origin/dev`.

- [ ] **Step 1: Write the failing test** (`Tests/test_rate_limit.py`)

```python
import pytest
from starlette.requests import Request

from api.rate_limit import RateLimiter, _client_ip
from api.settings import get_settings


def _request(headers: dict[str, str], client: tuple[str, int] | None = ("10.0.0.9", 1234)) -> Request:
    scope = {
        "type": "http",
        "headers": [(name.lower().encode(), value.encode()) for name, value in headers.items()],
        "client": client,
    }
    return Request(scope)


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_uses_the_first_forwarded_for_value_by_default():
    assert _client_ip(_request({"X-Forwarded-For": "1.2.3.4, 10.0.0.1"})) == "1.2.3.4"


def test_falls_back_to_the_socket_address_with_no_headers():
    assert _client_ip(_request({})) == "10.0.0.9"


def test_uses_the_configured_header_over_forwarded_for(monkeypatch):
    monkeypatch.setenv("APIV2_CLIENT_IP_HEADER", "CF-Connecting-IP")
    request = _request({"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "6.6.6.6, 10.0.0.1"})
    assert _client_ip(request) == "203.0.113.7"


def test_falls_back_when_the_configured_header_is_missing(monkeypatch):
    monkeypatch.setenv("APIV2_CLIENT_IP_HEADER", "CF-Connecting-IP")
    assert _client_ip(_request({"X-Forwarded-For": "1.2.3.4"})) == "1.2.3.4"


def test_players_behind_the_same_proxy_get_separate_buckets(monkeypatch):
    monkeypatch.setenv("APIV2_CLIENT_IP_HEADER", "CF-Connecting-IP")
    limiter = RateLimiter(max_requests=1, window_seconds=60)
    limiter(_request({"CF-Connecting-IP": "203.0.113.7"}))
    limiter(_request({"CF-Connecting-IP": "203.0.113.8"}))
    with pytest.raises(Exception):
        limiter(_request({"CF-Connecting-IP": "203.0.113.7"}))
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd ~/xvm-api-clientip && uv run pytest Tests/test_rate_limit.py -v`
Expected: FAIL. The last three tests fail because `CLIENT_IP_HEADER` does not exist yet.

- [ ] **Step 3: Implement**

In `src/api/settings.py`, add under `DEBUG`:

```python
    CLIENT_IP_HEADER: str | None = None
```

In `src/api/rate_limit.py`, add `from api.settings import get_settings` to the imports and replace `_client_ip`:

```python
def _client_ip(request: Request) -> str:
    header = get_settings().CLIENT_IP_HEADER
    if header:
        value = request.headers.get(header)
        if value:
            return value.split(",")[0].strip()
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd ~/xvm-api-clientip && uv run pytest Tests/test_rate_limit.py -v && uv run ruff check . && uv run mypy`
Expected: 5 passed, no lint or type errors.

- [ ] **Step 5: Commit and open a draft PR for Allegro**

```bash
git add src/api/settings.py src/api/rate_limit.py Tests/test_rate_limit.py
git commit -m "Take the client IP for rate limiting from a configured header

Behind Cloudflare the first X-Forwarded-For value is either the proxy
(one shared bucket for every player) or caller-chosen (spoofable).
CF-Connecting-IP is set by Cloudflare and cannot be overridden by the
caller. APIV2_CLIENT_IP_HEADER names the header to trust; unset keeps
today's behaviour."
git push -u origin feat/client-ip-header
gh pr create --draft --base dev --repo xiv-venue-manager/xvm-api --title "Take the client IP for rate limiting from a configured header" --body "Needed before xvm-api is reachable from players' machines for the plugin (pairing exchange is limited to 10 per minute per IP). Proposed shape for you to reshape: one setting, default unchanged. Deploy note: set APIV2_CLIENT_IP_HEADER=CF-Connecting-IP in production before the public route is opened."
```

---

### Task 3: Open the public route

Production infrastructure change. Do it only after Task 2 is merged and deployed with `APIV2_CLIENT_IP_HEADER=CF-Connecting-IP` set, and with Allegro's yes from Task 1.

**Files:** none.

- [ ] **Step 1: Add the tunnel route.** Save this as `add-api-route.py` on the server (it reads the credentials from the environment and never prints them). `UPSTREAM` is the value you wrote down in Task 1, in the same style as the existing entry, for example `http://xvm-api:8000`.

```python
import json
import os
import sys
import urllib.request

HOSTNAME = "api.xivvenuemanager.com"
upstream = sys.argv[1]
account = os.environ["CF_ACCOUNT_ID"]
tunnel = os.environ["CF_TUNNEL_ID"]
url = f"https://api.cloudflare.com/client/v4/accounts/{account}/cfd_tunnel/{tunnel}/configurations"
headers = {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}", "Content-Type": "application/json"}

with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as response:
    config = json.load(response)["result"]["config"]

if any(entry.get("hostname") == HOSTNAME for entry in config["ingress"]):
    sys.exit(f"{HOSTNAME} already has a route")

config["ingress"].insert(-1, {"hostname": HOSTNAME, "service": upstream})
request = urllib.request.Request(url, data=json.dumps({"config": config}).encode(), headers=headers, method="PUT")
with urllib.request.urlopen(request) as response:
    print("route added" if json.load(response)["success"] else "failed")
```

Run: `ssh server@192.168.1.122 'set -a; . /home/server/.xiv-env; set +a; python3 add-api-route.py http://xvm-api:8000'`
Expected: `route added`. The entry goes before the catch-all, which must stay last.

- [ ] **Step 2: Add the DNS record.** In the Cloudflare dashboard, add a proxied CNAME `api` pointing to `<CF_TUNNEL_ID>.cfargotunnel.com` (the API token on the server is limited to Tunnel Edit and cache purge, so it probably cannot create DNS records).

- [ ] **Step 3: Verify**

Run: `curl -sS https://api.xivvenuemanager.com/health`
Expected: `{"status":"ok"}`.

Run: `for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://api.xivvenuemanager.com/auth/pairing/exchange -H 'Content-Type: application/json' -d '{"code":"ZZZZZZZZ","client":"plugin"}'; done; echo`
Expected: ten `400` (unknown code), then `429`. The limit trips for this machine only.

- [ ] **Step 4: Check that two clients get separate buckets.** From a second network or a phone hotspot, run one of the exchange calls above. Expected: `400`, not `429`, while the first machine is still limited. If it answers `429`, the header setting is not live: stop and recheck Task 2's deploy note.

- [ ] **Step 5: Record** the result and the date in this task, and commit.

```bash
git add docs/superpowers/plans/2026-10-10-plugin-pairing.md
git commit -m "docs: record the public xvm-api route"
```

---

### Task 4: Dashboard client function for pairing codes

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (after `revokeCredential`, about line 355)
- Test: `apps/web/lib/api/xvm-api-pairing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubGlobal("fetch", vi.fn())
})

const ok = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status })

describe("createPairingCode", () => {
  it("asks for an account-wide plugin code with the person's token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      ok({ code: "ABCD1234", client: "plugin", venue_id: null, expires_at: "2026-10-10T00:00:00Z" })
    )
    const { createPairingCode } = await import("./xvm-api")
    const issued = await createPairingCode("tok")
    expect(issued.code).toBe("ABCD1234")
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://xvm.test/auth/pairing/codes")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ client: "plugin", venue_id: null })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/web && npx vitest run lib/api/xvm-api-pairing.test.ts`
Expected: FAIL, `createPairingCode` is not exported.

- [ ] **Step 3: Implement** (add after `revokeCredential`)

```ts
export interface PairingCodeIssued {
  code: string
  client: "plugin"
  venue_id: string | null
  expires_at: string
}

export async function createPairingCode(personToken: string): Promise<PairingCodeIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PairingCodeIssued>(
    "/auth/pairing/codes",
    { method: "POST", body: JSON.stringify({ client: "plugin", venue_id: null }) },
    personToken
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd apps/web && npx vitest run lib/api/xvm-api-pairing.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api-pairing.test.ts
git commit -m "feat(xvm-api): client call for plugin pairing codes"
```

---

### Task 5: Route that issues a pairing code

**Files:**
- Create: `apps/web/app/api/plugin/pairing-codes/route.ts`
- Test: `apps/web/app/api/plugin/pairing-codes/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  create: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ createPairingCode: m.create }))

import { POST } from "./route"

const call = () => POST(new NextRequest("http://localhost/api/plugin/pairing-codes", { method: "POST" }))

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
})

describe("POST /api/plugin/pairing-codes", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 503 when the person has no xvm-api credential", async () => {
    m.token.mockResolvedValue(null)
    expect((await call()).status).toBe(503)
  })

  it("returns the code and when it expires", async () => {
    m.create.mockResolvedValue({ code: "ABCD1234", client: "plugin", venue_id: null, expires_at: "2026-10-10T00:00:00Z" })
    const res = await call()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ code: "ABCD1234", expiresAt: "2026-10-10T00:00:00Z" })
    expect(m.create).toHaveBeenCalledWith("tok")
  })

  it("hands an xvm-api failure to the shared error response", async () => {
    m.create.mockRejectedValue(new Error("down"))
    m.errorResponse.mockResolvedValue(NextResponse.json({ error: "xvm-api unavailable" }, { status: 502 }))
    expect((await call()).status).toBe(502)
    expect(m.errorResponse).toHaveBeenCalledWith(expect.any(Error), "u1", "[plugin pairing] create code error")
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd apps/web && npx vitest run app/api/plugin/pairing-codes`
Expected: FAIL, the route does not exist.

- [ ] **Step 3: Implement**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { createPairingCode } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export const POST = withRateLimit(
  async (_request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const issued = await createPairingCode(token)
      return NextResponse.json({ code: issued.code, expiresAt: issued.expires_at }, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[plugin pairing] create code error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd apps/web && npx vitest run app/api/plugin/pairing-codes && npx tsc --noEmit -p . && npx eslint app/api/plugin/pairing-codes`
Expected: 4 passed, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/plugin/pairing-codes
git commit -m "feat(plugin): route that issues a plugin pairing code"
```

---

### Task 6: Routes that list and revoke linked plugins

Only credentials with `client === "plugin"` are ever listed or revoked. Without that filter, DELETE could revoke the person's own web credential and sign them out.

**Files:**
- Create: `apps/web/app/api/plugin/credentials/route.ts`
- Create: `apps/web/app/api/plugin/credentials/[credentialId]/route.ts`
- Test: `apps/web/app/api/plugin/credentials/route.test.ts`
- Test: `apps/web/app/api/plugin/credentials/[credentialId]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

`credentials/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), errorResponse: vi.fn(), list: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyCredentials: m.list }))

import { GET } from "./route"

const credential = (over: Record<string, unknown>) => ({
  id: 1,
  kind: "api_key",
  client: "plugin",
  name: "plugin key",
  preview: "abc123",
  venue_id: null,
  issued_at: "2026-10-09T00:00:00Z",
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/plugin/credentials", () => {
  it("answers 401 without a session", async () => {
    m.session.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("lists only live plugin credentials", async () => {
    m.list.mockResolvedValue([
      credential({ id: 1 }),
      credential({ id: 2, client: "dashboard" }),
      credential({ id: 3, revoked_at: "2026-10-10T00:00:00Z" }),
    ])
    const body = await (await GET()).json()
    expect(body.credentials).toEqual([
      { id: 1, name: "plugin key", preview: "abc123", venueId: null, issuedAt: "2026-10-09T00:00:00Z", lastUsedAt: null },
    ])
  })
})
```

`credentials/[credentialId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  errorResponse: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyCredentials: m.list, revokeCredential: m.revoke }))

import { DELETE } from "./route"

const call = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/plugin/credentials/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ credentialId: id }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.token.mockResolvedValue("tok")
  m.list.mockResolvedValue([
    { id: 1, client: "plugin" },
    { id: 2, client: "dashboard" },
  ])
  m.revoke.mockResolvedValue({})
})

describe("DELETE /api/plugin/credentials/[credentialId]", () => {
  it("revokes one of the person's plugin credentials", async () => {
    expect((await call("1")).status).toBe(200)
    expect(m.revoke).toHaveBeenCalledWith("tok", 1)
  })

  it("is 404 for a credential that is not a plugin credential of theirs", async () => {
    expect((await call("2")).status).toBe(404)
    expect((await call("99")).status).toBe(404)
    expect(m.revoke).not.toHaveBeenCalled()
  })

  it.each(["abc", "0", "-3", "1.5"])("is 400 for the id %s", async (id) => {
    expect((await call(id)).status).toBe(400)
    expect(m.revoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd apps/web && npx vitest run app/api/plugin/credentials`
Expected: FAIL, the routes do not exist.

- [ ] **Step 3: Implement**

`credentials/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listMyCredentials } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const credentials = await listMyCredentials(token)
    return NextResponse.json({
      credentials: credentials
        .filter((c) => c.client === "plugin" && c.revoked_at === null)
        .map((c) => ({
          id: c.id,
          name: c.name,
          preview: c.preview,
          venueId: c.venue_id,
          issuedAt: c.issued_at,
          lastUsedAt: c.last_used_at,
        })),
    })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[plugin credentials] list error")
  }
}
```

`credentials/[credentialId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listMyCredentials, revokeCredential } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export async function DELETE(_request: NextRequest, context: { params: Promise<{ credentialId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { credentialId } = await context.params
  const id = Number(credentialId)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid credential id" }, { status: 400 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const credentials = await listMyCredentials(token)
    if (!credentials.some((c) => c.id === id && c.client === "plugin")) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    await revokeCredential(token, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[plugin credentials] revoke error")
  }
}
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `cd apps/web && npx vitest run app/api/plugin/credentials && npx tsc --noEmit -p . && npx eslint app/api/plugin/credentials`
Expected: all pass, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/plugin/credentials
git commit -m "feat(plugin): routes to list and revoke linked plugins"
```

---

### Task 7: A "Link the plugin" card on the API keys page

There is no jsdom in this repo, so this task is verified by hand on the local stack (`docs/LOCAL_DEV.md`).

**Files:**
- Create: `apps/web/components/plugin-link-card.tsx`
- Modify: `apps/web/app/dashboard/api-keys/page.tsx` (import, and one line in the page body)

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ServerTime } from "@/components/server-time"

interface LinkedPlugin {
  id: number
  name: string
  preview: string
  issuedAt: string
  lastUsedAt: string | null
}

interface IssuedCode {
  code: string
  expiresAt: string
}

export function PluginLinkCard() {
  const [linked, setLinked] = useState<LinkedPlugin[]>([])
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const res = await fetch("/api/plugin/credentials")
    if (res.ok) setLinked((await res.json()).credentials ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/plugin/pairing-codes", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not create a link code")
      setIssued({ code: data.code, expiresAt: data.expiresAt })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a link code")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: number) {
    setError("")
    const res = await fetch(`/api/plugin/credentials/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setError("Could not unlink that plugin")
      return
    }
    await load()
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Link the plugin</CardTitle>
        <CardDescription>
          Generate a one-time code, then enter it in the plugin under Settings, Account link. One link covers every
          venue you work at.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={generate} disabled={busy}>
          {busy ? "Creating…" : "Generate link code"}
        </Button>

        {issued && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-sm text-muted-foreground">
              Enter this code in the plugin. It works once and expires at <ServerTime date={issued.expiresAt} formatStr="time" /> (ST).
            </p>
            <p className="mt-2 select-all font-mono text-2xl tracking-widest">{issued.code}</p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium">Linked plugins</h3>
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plugin is linked yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {linked.map((plugin) => (
                <li key={plugin.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {plugin.name} <span className="font-mono text-muted-foreground">…{plugin.preview}</span>
                    <span className="ml-2 text-muted-foreground">
                      linked <ServerTime date={plugin.issuedAt} formatStr="datetime" />
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => revoke(plugin.id)}>
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Render it on the page.** In `apps/web/app/dashboard/api-keys/page.tsx`, add `import { PluginLinkCard } from "@/components/plugin-link-card"` with the other imports, and put `<PluginLinkCard />` directly after the `success` alert block and before `{!hasMemberVenues ? (`. It renders for people with no venue too, because pairing is a legitimate first touch.

- [ ] **Step 3: Type and lint**

Run: `cd apps/web && npx tsc --noEmit -p . && npx eslint components/plugin-link-card.tsx app/dashboard/api-keys`
Expected: 0 errors.

- [ ] **Step 4: Check by hand on the local stack.** Sign in, open `/dashboard/api-keys`, then:
  1. Click "Generate link code". A code of about 8 characters appears with an expiry time.
  2. Redeem it: `curl -sS -X POST $XVM_API_BASE_URL/auth/pairing/exchange -H 'Content-Type: application/json' -d '{"code":"<code>","client":"plugin"}'`. Expected: HTTP 201 with a `secret`.
  3. Reload the page. "Linked plugins" shows one entry.
  4. Click "Unlink". The entry disappears. Redeeming the same code again returns 409.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/plugin-link-card.tsx apps/web/app/dashboard/api-keys/page.tsx
git commit -m "feat(plugin): link the plugin with a one-time code from the API keys page"
```

---

### Task 8: Plugin link flow, tested without the game

The whole exchange-and-verify logic lives in one file with no Dalamud dependency, so xunit can compile it directly. Confirm with the user before running any `dotnet` command in this repo.

**Files:**
- Create: `VenueManager/XvmApiPairing.cs`
- Create: `VenueManager.Tests/VenueManager.Tests.csproj`
- Create: `VenueManager.Tests/XvmApiPairingTests.cs`

Work in `xvm-plugin-dev` (the private repo), never in the public `xvm-plugin` release repo.

- [ ] **Step 1: Create the test project** (`VenueManager.Tests/VenueManager.Tests.csproj`)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="..\VenueManager\XvmApiPairing.cs" Link="XvmApiPairing.cs" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Write the failing tests** (`VenueManager.Tests/XvmApiPairingTests.cs`)

```csharp
using System.Net;
using System.Text;
using VenueManager;
using Xunit;

public class XvmApiPairingTests
{
    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Queue<Func<HttpResponseMessage>> _responses = new();
        public List<(HttpMethod Method, string Url, string? Authorization, string Body)> Requests { get; } = new();

        public FakeHandler Respond(HttpStatusCode status, string json = "{}")
        {
            _responses.Enqueue(() => new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
            return this;
        }

        public FakeHandler Throw()
        {
            _responses.Enqueue(() => throw new HttpRequestException("no route"));
            return this;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, request.RequestUri!.ToString(), request.Headers.Authorization?.ToString(), body));
            return _responses.Dequeue()();
        }
    }

    private const string Exchanged = "{\"secret\":\"s3cret\",\"credential\":{\"id\":7}}";
    private const string Me = "{\"kind\":\"api_key\",\"client\":\"plugin\",\"name\":\"plugin key\",\"venue_narrow\":null,\"person\":{\"id\":3,\"display_name\":\"Ehno\"},\"memberships\":[]}";

    private static (HttpClient Http, FakeHandler Handler) Client(FakeHandler handler) => (new HttpClient(handler), handler);

    [Theory]
    [InlineData(" abcd-1234 ", "ABCD1234")]
    [InlineData("ab cd 12 34", "ABCD1234")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void NormalizeCode_trims_strips_separators_and_upper_cases(string? raw, string expected)
    {
        Assert.Equal(expected, XvmApiPairing.NormalizeCode(raw));
    }

    [Fact]
    public async Task Links_by_exchanging_the_code_then_verifying_it_with_me()
    {
        var (http, handler) = Client(new FakeHandler().Respond(HttpStatusCode.Created, Exchanged).Respond(HttpStatusCode.OK, Me));

        var result = await XvmApiPairing.LinkAsync(http, "https://api.test/", " abcd-1234 ");

        Assert.True(result.Success);
        Assert.Equal("s3cret", result.Secret);
        Assert.Equal("Ehno", result.PersonName);
        Assert.Equal("https://api.test/auth/pairing/exchange", handler.Requests[0].Url);
        Assert.Contains("\"code\":\"ABCD1234\"", handler.Requests[0].Body);
        Assert.Contains("\"client\":\"plugin\"", handler.Requests[0].Body);
        Assert.Equal("https://api.test/me", handler.Requests[1].Url);
        Assert.Equal("Bearer s3cret", handler.Requests[1].Authorization);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, PairingOutcome.UnknownCode)]
    [InlineData(HttpStatusCode.Conflict, PairingOutcome.CodeUsedOrExpired)]
    [InlineData(HttpStatusCode.TooManyRequests, PairingOutcome.RateLimited)]
    [InlineData(HttpStatusCode.InternalServerError, PairingOutcome.Failed)]
    public async Task Maps_exchange_failures_to_an_outcome_and_stores_no_secret(HttpStatusCode status, PairingOutcome expected)
    {
        var (http, handler) = Client(new FakeHandler().Respond(status));

        var result = await XvmApiPairing.LinkAsync(http, "https://api.test", "ABCD1234");

        Assert.Equal(expected, result.Outcome);
        Assert.Null(result.Secret);
        Assert.False(string.IsNullOrEmpty(result.Message));
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Reports_an_unreachable_server()
    {
        var (http, _) = Client(new FakeHandler().Throw());
        var result = await XvmApiPairing.LinkAsync(http, "https://api.test", "ABCD1234");
        Assert.Equal(PairingOutcome.Unreachable, result.Outcome);
    }

    [Fact]
    public async Task Does_not_keep_a_secret_that_me_rejects()
    {
        var (http, _) = Client(new FakeHandler().Respond(HttpStatusCode.Created, Exchanged).Respond(HttpStatusCode.Unauthorized));
        var result = await XvmApiPairing.LinkAsync(http, "https://api.test", "ABCD1234");
        Assert.Equal(PairingOutcome.Failed, result.Outcome);
        Assert.Null(result.Secret);
    }

    [Fact]
    public async Task An_empty_code_is_unknown_and_sends_nothing()
    {
        var (http, handler) = Client(new FakeHandler());
        var result = await XvmApiPairing.LinkAsync(http, "https://api.test", "  ");
        Assert.Equal(PairingOutcome.UnknownCode, result.Outcome);
        Assert.Empty(handler.Requests);
    }
}
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`
Expected: FAIL to compile, `XvmApiPairing` does not exist.

- [ ] **Step 4: Implement** (`VenueManager/XvmApiPairing.cs`)

```csharp
using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace VenueManager
{
  public enum PairingOutcome
  {
    Linked,
    UnknownCode,
    CodeUsedOrExpired,
    RateLimited,
    Unreachable,
    Failed,
  }

  public record PairingResult(PairingOutcome Outcome, string? Secret = null, string? PersonName = null)
  {
    public bool Success => Outcome == PairingOutcome.Linked;

    public string Message => Outcome switch
    {
      PairingOutcome.Linked => "Linked.",
      PairingOutcome.UnknownCode => "That code was not recognised. Check it and try again.",
      PairingOutcome.CodeUsedOrExpired => "That code has already been used or has expired. Generate a new one on the website.",
      PairingOutcome.RateLimited => "Too many attempts. Wait a minute and try again.",
      PairingOutcome.Unreachable => "Could not reach the server. Check your connection and try again.",
      _ => "Linking failed. Try again, and generate a new code if it keeps failing.",
    };
  }

  public static class XvmApiPairing
  {
    public const string DefaultUrl = "https://api.xivvenuemanager.com";

    private sealed record ExchangeResponse([property: JsonPropertyName("secret")] string? Secret);

    private sealed record MePerson([property: JsonPropertyName("display_name")] string? DisplayName);

    private sealed record MeResponse([property: JsonPropertyName("person")] MePerson? Person);

    public static string NormalizeCode(string? raw)
    {
      if (string.IsNullOrWhiteSpace(raw)) return "";
      return raw.Replace(" ", "").Replace("-", "").Trim().ToUpperInvariant();
    }

    public static async Task<PairingResult> LinkAsync(HttpClient http, string baseUrl, string? rawCode)
    {
      var code = NormalizeCode(rawCode);
      if (code.Length == 0) return new PairingResult(PairingOutcome.UnknownCode);

      var root = baseUrl.Trim().TrimEnd('/');
      try
      {
        using var exchange = await http.PostAsJsonAsync($"{root}/auth/pairing/exchange", new { code, client = "plugin" });
        switch (exchange.StatusCode)
        {
          case HttpStatusCode.BadRequest:
            return new PairingResult(PairingOutcome.UnknownCode);
          case HttpStatusCode.Conflict:
            return new PairingResult(PairingOutcome.CodeUsedOrExpired);
          case HttpStatusCode.TooManyRequests:
            return new PairingResult(PairingOutcome.RateLimited);
        }
        if (!exchange.IsSuccessStatusCode) return new PairingResult(PairingOutcome.Failed);

        var issued = await exchange.Content.ReadFromJsonAsync<ExchangeResponse>();
        if (string.IsNullOrEmpty(issued?.Secret)) return new PairingResult(PairingOutcome.Failed);

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{root}/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", issued.Secret);
        using var me = await http.SendAsync(request);
        if (!me.IsSuccessStatusCode) return new PairingResult(PairingOutcome.Failed);

        var identity = await me.Content.ReadFromJsonAsync<MeResponse>();
        return new PairingResult(PairingOutcome.Linked, issued.Secret, identity?.Person?.DisplayName);
      }
      catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
      {
        return new PairingResult(PairingOutcome.Unreachable);
      }
    }
  }
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add VenueManager/XvmApiPairing.cs VenueManager.Tests
git commit -m "feat: link the plugin to an account with a pairing code"
```

---

### Task 9: Plugin settings: the "Account link" section

The link flow itself is tested. This wires it to the Settings tab and stores the result. Confirm with the user before building.

**Files:**
- Modify: `VenueManager/Configuration.cs` (after `syncToXivApp`, about line 60)
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs` (usings; fields near line 40; the `DrawXivAppSettings();` call near line 63; two new methods)

- [ ] **Step 1: Add the configuration fields** in `Configuration.cs`, directly after `public bool syncToXivApp { get; set; } = false;`

```csharp
    public string xvmApiUrl { get; set; } = XvmApiPairing.DefaultUrl;
    public string xvmApiSecret { get; set; } = "";
    public string xvmApiPersonName { get; set; } = "";
```

- [ ] **Step 2: Add the section.** In `SettingsTab.cs`, add `using System.Net.Http;` with the other usings. Next to `private string xivAppStatus = "";` add:

```csharp
  private static readonly HttpClient XvmHttp = new() { Timeout = TimeSpan.FromSeconds(10) };
  private string pairingCode = "";
  private bool linking = false;
  private string linkStatus = "";
  private Vector4 linkStatusColor = Colors.StatusWarn;
```

Directly above the existing `DrawXivAppSettings();` call (about line 63), add `DrawAccountLink();`. Then add these methods next to `DrawXivAppSettings`:

```csharp
  private void DrawAccountLink()
  {
    DrawSectionHeader("Account link");
    ImGui.TextColored(Colors.XivSubtext0, "Link this plugin to your xivvenuemanager.com account with a one-time code.");
    ImGui.Spacing();

    if (!string.IsNullOrEmpty(this.configuration.xvmApiSecret))
    {
      var who = string.IsNullOrEmpty(this.configuration.xvmApiPersonName) ? "your account" : this.configuration.xvmApiPersonName;
      ImGui.TextColored(StatusOk, $"Linked as {who}");
      if (ImGui.Button("Unlink"))
      {
        this.configuration.xvmApiSecret = "";
        this.configuration.xvmApiPersonName = "";
        this.configuration.Save();
        linkStatus = "";
      }
      ImGui.Spacing();
      return;
    }

    ImGui.InputTextWithHint("Link code", "ABCD1234", ref pairingCode, 16);
    ImGui.SameLine();
    if (linking) ImGui.BeginDisabled();
    if (ImGui.Button("Link") && !linking) _ = LinkAccountAsync();
    if (linking) ImGui.EndDisabled();
    ImGui.TextDisabled("Get a code at xivvenuemanager.com/dashboard/api-keys.");
    if (!string.IsNullOrEmpty(linkStatus)) ImGui.TextColored(linkStatusColor, linkStatus);
    ImGui.Spacing();
  }

  private async Task LinkAccountAsync()
  {
    linking = true;
    linkStatus = "Linking…";
    linkStatusColor = StatusWarn;
    try
    {
      var url = string.IsNullOrWhiteSpace(this.configuration.xvmApiUrl) ? XvmApiPairing.DefaultUrl : this.configuration.xvmApiUrl;
      var result = await XvmApiPairing.LinkAsync(XvmHttp, url, pairingCode);
      if (result.Success)
      {
        this.configuration.xvmApiSecret = result.Secret!;
        this.configuration.xvmApiPersonName = result.PersonName ?? "";
        this.configuration.Save();
        pairingCode = "";
        linkStatus = "";
      }
      else
      {
        linkStatus = result.Message;
        linkStatusColor = StatusErr;
      }
    }
    finally
    {
      linking = false;
    }
  }
```

- [ ] **Step 3: Build** (after the user confirms)

Run: `cd ~/xvm-plugin-dev && rm -rf VenueManager/bin VenueManager/obj && dotnet build VenueManager.sln -c Release`
Expected: 0 errors. A clean build matters here because stale `obj` output has produced old DLLs before.

- [ ] **Step 4: Commit**

```bash
git add VenueManager/Configuration.cs VenueManager/UI/Tabs/SettingsTab.cs
git commit -m "feat: account link section in the settings tab"
```

---

### Task 10: Check it end to end

Needs the public route from Task 3, or a local xvm-api with `xvmApiUrl` pointed at it (set it in the plugin's config file for a local run).

- [ ] **Step 1:** On the dashboard, open `/dashboard/api-keys`, click "Generate link code".
- [ ] **Step 2:** Load the built plugin in the game, open Settings, Account link, enter the code, click Link. Expected: "Linked as <your name>".
- [ ] **Step 3:** On the dashboard, reload. "Linked plugins" shows one entry.
- [ ] **Step 4:** Click Link again in the plugin with the same code (after unlinking). Expected: the "already been used" message.
- [ ] **Step 5:** On the dashboard, click "Unlink". Expected: the entry disappears. The plugin keeps showing "Linked" until it next calls xvm-api, which is the first thing the next plan handles.
- [ ] **Step 6:** Record the result in this plan and in the PR descriptions.

---

## After this plan

Each of these gets its own plan once a paired plugin exists:

1. **Read routes on xvm-api:** shifts (`GET /venues/{id}/shifts?mine=true`, mapping `pending_approval` and `scheduled` to the plugin's `CLAIMED`), roles (memberships plus positions), services, rooms, bans, `events/active`.
2. **Write routes:** patron visits, transactions (sales), clock-in and clock-out (no early limit, no open or closed side effect), inventory link and restock (the shapes differ and `inventory-settings` has no xvm-api home yet).
3. **Venue auto-map:** `GET /me/venues`, matching on world, district, ward, plot or apartment plus building, and room. This is the one that retires the venue selector. It depends on #187 (required address and the main or subdivision choice).
4. **Shift prompts:** a notification at the scheduled start and end with a Clock in and Clock out button, across every venue via `GET /me/shifts`. Plugin issue #2 describes the venue-switch half and needs rewording first, because it still assumes the dashboard proxies.
5. **Retire the old path:** the `keys` routes, the Prisma `ApiKey` table, and the `vm_` gate, once the old plugin versions are gone.

## Self-review

**Spec coverage.** Decisions D1 to D8 each map to a task or to a later plan: D1 and D2 to Tasks 4 to 9, D3 to the whole plan (no `vm_` import anywhere), D4 to Task 8 (the plugin never requests a scope), D5 to the file list (`keys` routes untouched), D6 to Tasks 4 to 7 (no Prisma imports), D7 to Tasks 1 to 3, and D8 to "After this plan". The rate limit problem found while writing the plan has Task 2.

**Placeholder scan.** Task 1 records answers that only Allegro and the server can give, and Task 3 uses them, with the commands to find each one. No step says "TBD" or "add validation"; every code step has the code.

**Consistency.** `createPairingCode(personToken)` takes no venue argument in Tasks 4 and 5 and in the tests. `PairingOutcome` and `PairingResult.Message` are used with the same names in Tasks 8 and 9. The route response shape `{code, expiresAt}` matches the component's `IssuedCode`, and the credentials response `{credentials: [...]}` matches `LinkedPlugin`.
