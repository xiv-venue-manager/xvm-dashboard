# Meet the team: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/team` page (editorial rows grouped under headings), a members-only `/team/edit` screen for photo, bio and listing, and an admin `/admin/team` screen to add, retitle, group, order and remove people.

**Architecture:** Server-rendered `/team` reads `GET /public/team` through the xvm-api client. Client pages talk to thin Next route handlers that forward to xvm-api with the signed-in person's token, the same shape as `app/api/admin/announcements`. Grouping and initials are pure functions in `lib/team-groups.ts`, which is where the tests live (vitest runs in a node environment, so there are no component tests).

**Tech Stack:** Next.js (App Router; read `node_modules/next/dist/docs/` before relying on any API, per `apps/web/AGENTS.md`), React, Tailwind with the XIV tokens, zod, vitest, next-auth.

**Depends on:** `docs/superpowers/plans/2026-10-29-team-page-xvm-api.md`. Tasks 1-5 here are built against mocked `fetch` and need no running API. Task 6's live check needs the xvm-api `feat/team-page` branch running locally (see `docs/LOCAL_DEV.md`, section "xvm-api").

**Spec:** `docs/superpowers/specs/2026-10-29-meet-the-team-design.md`.

**Decisions made while reading the code:**
- Photos render with a plain `<img>`, as `app/venues/[slug]/page.tsx` does (with the same `eslint-disable-next-line @next/next/no-img-element`). The CSP `img-src` in `proxy.ts` only whitelists `MINIO_PUBLIC_URL`; Task 6 checks that xvm-api's media host is allowed and widens the CSP only if it is not.
- The admin gate follows `app/api/admin/announcements`: the routes forward to xvm-api, which enforces `platform_admin` and answers 403. The page shows `adminLoadErrorMessage`.
- The "Edit my card" link is a small client component, so `/team` stays statically cached.
- Request and response bodies stay in xvm-api's snake_case; no camelCase mapping layer.
- Admin pages are not linked from the navbar today (`/admin/announcements` and `/admin/feedback` are reached by URL), so `/admin/team` is not either.

---

## Task 0: Workspace

`CLAUDE.md` requires a worktree for any code change, and `dev` is the real trunk (a worktree tool may default to `main`).

- [ ] **Step 1: Create the worktree off `origin/dev`**

```bash
git -C ~/xvm-dashboard fetch origin
git -C ~/xvm-dashboard worktree add ~/xvm-dashboard-team -b feat/team-page origin/dev
cd ~/xvm-dashboard-team && pnpm install --frozen-lockfile
```

Expected: worktree on `feat/team-page`, install finishes.

- [ ] **Step 2: Confirm a green baseline**

Run (from `~/xvm-dashboard-team/apps/web`): `pnpm run typecheck && pnpm run lint && pnpm test`
Expected: all pass. If anything fails, stop and report; do not build on a red base.

All commands below run from `~/xvm-dashboard-team/apps/web` unless stated.

---

## Task 1: Pure helpers

**Files:**
- Create: `lib/team-groups.ts`
- Create: `lib/team-groups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/team-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { groupTeam, initials, TEAM_BIO_MAX } from "./team-groups"

const member = (name: string, group_label: string | null) => ({
  name,
  role_title: "Role",
  group_label,
  bio: null,
  photo_url: null,
})

describe("groupTeam", () => {
  it("returns no sections for an empty team", () => {
    expect(groupTeam([])).toEqual([])
  })

  it("groups by label in the order each label first appears", () => {
    const sections = groupTeam([
      member("A", "Builders"),
      member("B", "Testers"),
      member("C", "Builders"),
    ])
    expect(sections.map((s) => s.label)).toEqual(["Builders", "Testers"])
    expect(sections[0].members.map((m) => m.name)).toEqual(["A", "C"])
    expect(sections[1].members.map((m) => m.name)).toEqual(["B"])
  })

  it("puts members without a label in a last section with no heading", () => {
    const sections = groupTeam([member("A", null), member("B", "Builders")])
    expect(sections.map((s) => s.label)).toEqual(["Builders", null])
    expect(sections[1].members.map((m) => m.name)).toEqual(["A"])
  })

  it("keeps a team with no labels at all as one section with no heading", () => {
    const sections = groupTeam([member("A", null), member("B", null)])
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBeNull()
  })
})

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Name Surname")).toBe("NS")
    expect(initials("  ada   king  lovelace ")).toBe("AL")
  })

  it("takes one letter from a single word", () => {
    expect(initials("ehno")).toBe("E")
  })

  it("does not split a character outside the basic plane", () => {
    expect(initials("\u{1D4D0}da")).toBe("\u{1D4D0}")
  })

  it("falls back to a question mark for a blank name", () => {
    expect(initials("   ")).toBe("?")
  })
})

describe("TEAM_BIO_MAX", () => {
  it("matches the ceiling xvm-api enforces", () => {
    expect(TEAM_BIO_MAX).toBe(1000)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/team-groups.test.ts`
Expected: FAIL, `Failed to resolve import "./team-groups"`.

- [ ] **Step 3: Write the implementation**

Create `lib/team-groups.ts`:

```ts
export const TEAM_BIO_MAX = 1000

interface Groupable {
  group_label: string | null
}

export interface TeamSection<T extends Groupable> {
  label: string | null
  members: T[]
}

export function groupTeam<T extends Groupable>(members: T[]): TeamSection<T>[] {
  const labelled = new Map<string, T[]>()
  const unlabelled: T[] = []
  for (const member of members) {
    if (member.group_label === null) {
      unlabelled.push(member)
      continue
    }
    const bucket = labelled.get(member.group_label)
    if (bucket) bucket.push(member)
    else labelled.set(member.group_label, [member])
  }
  const sections = [...labelled].map(([label, group]) => ({ label, members: group }))
  if (unlabelled.length > 0) sections.push({ label: null, members: unlabelled })
  return sections
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = [...words[0]][0]
  const last = words.length > 1 ? [...words[words.length - 1]][0] : ""
  return (first + last).toUpperCase()
}
```

`Map` keeps insertion order, which is what makes sections appear in the order of each label's first member.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run lib/team-groups.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/team-groups.ts lib/team-groups.test.ts
git commit -m "feat(team): grouping and initials helpers for the team page"
```

---

## Task 2: xvm-api client functions

**Files:**
- Modify: `lib/api/xvm-api.ts` (append a section at the end of the file)
- Create: `lib/api/xvm-api-team.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/api/xvm-api-team.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addTeamMember,
  getMyTeamProfile,
  getPublicTeam,
  listAdminTeam,
  removeTeamMember,
  searchTeamCandidates,
  setMyTeamPhoto,
  updateMyTeamProfile,
  updateTeamMember,
} from "./xvm-api"

function respond(body: unknown, status = 200) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status < 400,
    status,
    text: async () => (body === null ? "" : JSON.stringify(body)),
  } as Response)
}

const lastCall = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit]
const headers = (init: RequestInit) => init.headers as Record<string, string>

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

describe("team client", () => {
  it("reads the public team with no credential", async () => {
    respond({ members: [] })
    await expect(getPublicTeam()).resolves.toEqual({ members: [] })
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/public/team")
    expect(headers(init).Authorization).toBeUndefined()
  })

  it("reads my card with my token", async () => {
    respond({ name: "N", listed: true })
    await getMyTeamProfile("tok")
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile")
    expect(headers(init).Authorization).toBe("Bearer tok")
  })

  it("patches only the fields it is given", async () => {
    respond({ name: "N" })
    await updateMyTeamProfile("tok", { bio: "Hello" })
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ bio: "Hello" })
  })

  it("uploads a photo as multipart without setting its own content type", async () => {
    respond({ name: "N" })
    await setMyTeamPhoto("tok", new Blob(["x"], { type: "image/png" }))
    const [url, init] = lastCall()
    expect(url).toBe("http://xvm-api.test/me/team-profile/photo")
    expect(init.method).toBe("PUT")
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob)
    expect(headers(init)["Content-Type"]).toBeUndefined()
  })

  it("lists, adds, edits and removes team members as an admin", async () => {
    respond([])
    await listAdminTeam("tok")
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team")

    respond({ person_id: 7 }, 201)
    await addTeamMember("tok", { person_id: 7, role_title: "Tester", group_label: "Testers" })
    expect(lastCall()[1].method).toBe("POST")
    expect(JSON.parse(lastCall()[1].body as string)).toEqual({ person_id: 7, role_title: "Tester", group_label: "Testers" })

    respond({ person_id: 7 })
    await updateTeamMember("tok", 7, { sort_order: 2 })
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/7")
    expect(lastCall()[1].method).toBe("PATCH")

    respond(null, 204)
    await removeTeamMember("tok", 7)
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/7")
    expect(lastCall()[1].method).toBe("DELETE")
  })

  it("encodes a candidate search", async () => {
    respond([])
    await searchTeamCandidates("tok", "a&b c")
    expect(lastCall()[0]).toBe("http://xvm-api.test/admin/team/candidates?q=a%26b%20c")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/api/xvm-api-team.test.ts`
Expected: FAIL, the named imports do not exist.

- [ ] **Step 3: Append the client section**

At the end of `lib/api/xvm-api.ts`:

```ts
// ── Team ──────────────────────────────────────────────────────

export interface PublicTeamMember {
  name: string
  role_title: string
  group_label: string | null
  bio: string | null
  photo_url: string | null
}

export interface PublicTeam {
  members: PublicTeamMember[]
}

export interface TeamProfile extends PublicTeamMember {
  listed: boolean
}

export interface TeamProfileUpdate {
  bio?: string | null
  listed?: boolean
}

export interface AdminTeamMember extends TeamProfile {
  person_id: number
  sort_order: number
}

export interface TeamMemberCreate {
  person_id: number
  role_title: string
  group_label?: string | null
  sort_order?: number
}

export interface TeamMemberUpdate {
  role_title?: string
  group_label?: string | null
  sort_order?: number
}

export interface TeamCandidate {
  person_id: number
  name: string
}

export async function getPublicTeam(): Promise<PublicTeam> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PublicTeam>("/public/team", { next: { revalidate: 60 } })
}

export async function getMyTeamProfile(personToken: string): Promise<TeamProfile> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TeamProfile>("/me/team-profile", {}, personToken)
}

export async function updateMyTeamProfile(personToken: string, data: TeamProfileUpdate): Promise<TeamProfile> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TeamProfile>("/me/team-profile", { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function setMyTeamPhoto(personToken: string, file: File | Blob): Promise<TeamProfile> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<TeamProfile>("/me/team-profile/photo", { method: "PUT", body: form }, personToken)
}

export async function listAdminTeam(personToken: string): Promise<AdminTeamMember[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<AdminTeamMember[]>("/admin/team", {}, personToken)
}

export async function addTeamMember(personToken: string, data: TeamMemberCreate): Promise<AdminTeamMember> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<AdminTeamMember>("/admin/team", { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateTeamMember(
  personToken: string,
  personId: number,
  data: TeamMemberUpdate
): Promise<AdminTeamMember> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<AdminTeamMember>(`/admin/team/${personId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function removeTeamMember(personToken: string, personId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/admin/team/${personId}`, { method: "DELETE" }, personToken)
}

export async function searchTeamCandidates(personToken: string, query: string): Promise<TeamCandidate[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TeamCandidate[]>(`/admin/team/candidates?q=${encodeURIComponent(query)}`, {}, personToken)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run lib/api/xvm-api-team.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-api.ts lib/api/xvm-api-team.test.ts
git commit -m "feat(team): xvm-api client for the team endpoints"
```

---

## Task 3: Route handlers

**Files:**
- Create: `app/api/team/profile/route.ts`
- Create: `app/api/team/profile/route.test.ts`
- Create: `app/api/team/profile/photo/route.ts`
- Create: `app/api/admin/team/route.ts`
- Create: `app/api/admin/team/[personId]/route.ts`
- Create: `app/api/admin/team/candidates/route.ts`
- Create: `app/api/admin/team/route.test.ts`

- [ ] **Step 1: Write the failing profile-route test**

Create `app/api/team/profile/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), get: vi.fn(), update: vi.fn() }))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  getMyTeamProfile: m.get,
  updateMyTeamProfile: m.update,
}))

import { GET, PATCH } from "./route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request) => Promise<Response>
const get = () => (GET as unknown as Handler)(new Request("http://localhost/api"))
const patch = (body: unknown) =>
  (PATCH as unknown as Handler)(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }))
const card = { name: "N", role_title: "Developer", group_label: "Builders", bio: null, photo_url: null, listed: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("GET /api/team/profile", () => {
  it("is 401 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })

  it("returns my card", async () => {
    m.get.mockResolvedValue(card)
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(card)
    expect(m.get).toHaveBeenCalledWith("tok")
  })

  it("passes xvm-api's 404 through for someone off the team", async () => {
    m.get.mockRejectedValue(new XvmApiError(404, JSON.stringify({ detail: "You are not on the team." })))
    expect((await get()).status).toBe(404)
  })
})

describe("PATCH /api/team/profile", () => {
  it("rejects fields a member may not set, with no API call", async () => {
    for (const body of [{ role_title: "Boss" }, { group_label: "X" }, { sort_order: 0 }, { bio: "x".repeat(1001) }, { listed: null }]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(m.update).not.toHaveBeenCalled()
  })

  it("forwards a bio and listing change", async () => {
    m.update.mockResolvedValue({ ...card, bio: "Hello", listed: false })
    const res = await patch({ bio: "Hello", listed: false })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", { bio: "Hello", listed: false })
  })

  it("lets a member clear their bio", async () => {
    m.update.mockResolvedValue(card)
    expect((await patch({ bio: null })).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", { bio: null })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run app/api/team/profile/route.test.ts`
Expected: FAIL, `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the profile route**

Create `app/api/team/profile/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getMyTeamProfile, updateMyTeamProfile } from "@/lib/api/xvm-api"
import { TEAM_BIO_MAX } from "@/lib/team-groups"

const updateSchema = z
  .object({
    bio: z.string().max(TEAM_BIO_MAX).nullable().optional(),
    listed: z.boolean().optional(),
  })
  .strict()

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      return NextResponse.json(await getMyTeamProfile(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      return NextResponse.json(await updateMyTeamProfile(token, parsed.data))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 4: Write the photo route**

Create `app/api/team/profile/photo/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { setMyTeamPhoto } from "@/lib/api/xvm-api"

export const PUT = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })

    try {
      return NextResponse.json(await setMyTeamPhoto(token, file))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile/photo] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 5: Run the profile tests to verify they pass**

Run: `pnpm vitest run app/api/team/profile/route.test.ts`
Expected: all PASS.

- [ ] **Step 6: Write the failing admin-route test**

Create `app/api/admin/team/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/middleware/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock("@/lib/api/xvm-api-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/xvm-api-store")>("@/lib/api/xvm-api-store")
  return { ...actual, getValidXvmApiToken: m.token, invalidateXvmApiCredential: vi.fn() }
})
vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listAdminTeam: m.list,
  addTeamMember: m.add,
  updateTeamMember: m.update,
  removeTeamMember: m.remove,
  searchTeamCandidates: m.search,
}))

import { GET, POST } from "./route"
import { PATCH, DELETE } from "./[personId]/route"
import { GET as CANDIDATES } from "./candidates/route"
import { XvmApiError } from "@/lib/api/xvm-api"

type Handler = (req: Request, ctx?: { params: Promise<{ personId: string }> }) => Promise<Response>
const call = (handler: unknown, method: string, body?: unknown, url = "http://localhost/api") =>
  (handler as Handler)(new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }))
const withId = (handler: unknown, method: string, id: string, body?: unknown) =>
  (handler as Handler)(new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: Promise.resolve({ personId: id }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  m.session.mockResolvedValue({ user: { id: "user-1" } })
  m.token.mockResolvedValue("tok")
})

describe("/api/admin/team", () => {
  it("is 403 when signed out", async () => {
    m.session.mockResolvedValue(null)
    expect((await call(GET, "GET")).status).toBe(403)
  })

  it("forwards xvm-api's 403 for someone without the platform_admin scope", async () => {
    m.list.mockRejectedValue(new XvmApiError(403, JSON.stringify({ detail: "This action requires the platform_admin scope." })))
    const res = await call(GET, "GET")
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("platform_admin")
  })

  it("lists the team", async () => {
    m.list.mockResolvedValue([{ person_id: 1 }])
    const res = await call(GET, "GET")
    expect(await res.json()).toEqual([{ person_id: 1 }])
  })

  it("rejects an invalid add with no API call", async () => {
    for (const body of [{}, { person_id: 0, role_title: "X" }, { person_id: 1, role_title: "" }, { person_id: 1, role_title: "x".repeat(81) }, { person_id: 1, role_title: "X", group_label: "y".repeat(41) }, { person_id: 1, role_title: "X", extra: 1 }]) {
      expect((await call(POST, "POST", body)).status).toBe(400)
    }
    expect(m.add).not.toHaveBeenCalled()
  })

  it("adds a member", async () => {
    m.add.mockResolvedValue({ person_id: 7 })
    const res = await call(POST, "POST", { person_id: 7, role_title: "Tester", group_label: "Testers" })
    expect(res.status).toBe(201)
    expect(m.add).toHaveBeenCalledWith("tok", { person_id: 7, role_title: "Tester", group_label: "Testers" })
  })

  it("passes xvm-api's 409 for a double add through", async () => {
    m.add.mockRejectedValue(new XvmApiError(409, JSON.stringify({ detail: "That person is already on the team." })))
    expect((await call(POST, "POST", { person_id: 7, role_title: "Tester" })).status).toBe(409)
  })
})

describe("/api/admin/team/[personId]", () => {
  it("is 404 for an id that is not a number, with no API call", async () => {
    expect((await withId(PATCH, "PATCH", "abc", { role_title: "X" })).status).toBe(404)
    expect((await withId(DELETE, "DELETE", "1e3")).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it("rejects a blank role title or a negative order", async () => {
    expect((await withId(PATCH, "PATCH", "7", { role_title: "" })).status).toBe(400)
    expect((await withId(PATCH, "PATCH", "7", { sort_order: -1 })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("updates the role, group and order, and can clear the group", async () => {
    m.update.mockResolvedValue({ person_id: 7 })
    const res = await withId(PATCH, "PATCH", "7", { role_title: "Lead", group_label: null, sort_order: 2 })
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith("tok", 7, { role_title: "Lead", group_label: null, sort_order: 2 })
  })

  it("removes a member", async () => {
    m.remove.mockResolvedValue(undefined)
    const res = await withId(DELETE, "DELETE", "7")
    expect(res.status).toBe(200)
    expect(m.remove).toHaveBeenCalledWith("tok", 7)
  })
})

describe("/api/admin/team/candidates", () => {
  it("needs at least two characters", async () => {
    expect((await call(CANDIDATES, "GET", undefined, "http://localhost/api?q=a")).status).toBe(400)
    expect((await call(CANDIDATES, "GET", undefined, "http://localhost/api")).status).toBe(400)
    expect(m.search).not.toHaveBeenCalled()
  })

  it("searches by name", async () => {
    m.search.mockResolvedValue([{ person_id: 3, name: "Outsider" }])
    const res = await call(CANDIDATES, "GET", undefined, "http://localhost/api?q=out")
    expect(await res.json()).toEqual([{ person_id: 3, name: "Outsider" }])
    expect(m.search).toHaveBeenCalledWith("tok", "out")
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm vitest run app/api/admin/team/route.test.ts`
Expected: FAIL, unresolved imports for `./route`, `./[personId]/route`, `./candidates/route`.

- [ ] **Step 8: Write the admin routes**

Create `app/api/admin/team/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { addTeamMember, listAdminTeam } from "@/lib/api/xvm-api"

const createSchema = z
  .object({
    person_id: z.number().int().positive(),
    role_title: z.string().min(1).max(80),
    group_label: z.string().min(1).max(40).nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      return NextResponse.json(await listAdminTeam(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] list error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      return NextResponse.json(await addTeamMember(token, parsed.data), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] add error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

Create `app/api/admin/team/[personId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { removeTeamMember, updateTeamMember } from "@/lib/api/xvm-api"

const updateSchema = z
  .object({
    role_title: z.string().min(1).max(80).optional(),
    group_label: z.string().min(1).max(40).nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

type Context = { params: Promise<{ personId: string }> }

export const PATCH = withRateLimit<Context>(
  async (request: NextRequest, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { personId } = await context!.params
    if (!/^\d+$/.test(personId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      return NextResponse.json(await updateTeamMember(token, Number(personId), parsed.data))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] update error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
  async (request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { personId } = await context!.params
    if (!/^\d+$/.test(personId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      await removeTeamMember(token, Number(personId))
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] remove error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

Create `app/api/admin/team/candidates/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { searchTeamCandidates } from "@/lib/api/xvm-api"

export const GET = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
    if (q.length < 2 || q.length > 100) {
      return NextResponse.json({ error: "Search for at least two characters." }, { status: 400 })
    }

    try {
      return NextResponse.json(await searchTeamCandidates(token, q))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] candidates error")
    }
  },
  { requests: 60, window: "1 m" }
)
```

- [ ] **Step 9: Run the route tests to verify they pass**

Run: `pnpm vitest run app/api/team app/api/admin/team`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add app/api/team app/api/admin/team
git commit -m "feat(team): route handlers for the team card and admin screen"
```

---

## Task 4: The public page

**Files:**
- Create: `components/team-row.tsx`
- Create: `components/team-edit-link.tsx`
- Create: `app/team/page.tsx`
- Modify: `app/sitemap.ts`
- Modify: `components/site-footer.tsx`
- Modify: `docs/SHARED_ASSETS.md`

No unit tests: vitest runs in a node environment and the repo has no component tests. This task is verified by `tsc`, lint and the live check in Task 6.

- [ ] **Step 1: Add the row component**

Create `components/team-row.tsx`:

```tsx
import type { PublicTeamMember } from "@/lib/api/xvm-api"
import { initials } from "@/lib/team-groups"

type Card = Pick<PublicTeamMember, "name" | "role_title" | "bio" | "photo_url">

export function TeamRow({ member, flip }: { member: Card; flip: boolean }) {
  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-[var(--blue-018)] bg-card p-4 shadow-[var(--glow-card-inset)] sm:items-center sm:gap-6 sm:p-5 ${
        flip ? "sm:flex-row-reverse" : "sm:flex-row"
      }`}
    >
      {member.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.photo_url}
          alt={member.name}
          width={120}
          height={120}
          className="h-[120px] w-[120px] flex-none rounded-[10px] object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-[120px] w-[120px] flex-none items-center justify-center rounded-[10px] bg-gradient-to-br from-[#0a3a5c] to-[#00b4ff44] font-heading text-4xl font-semibold text-[var(--xiv-blue)]"
        >
          {initials(member.name)}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="font-heading text-lg font-semibold text-foreground">{member.name}</h3>
        <span className="mt-1.5 inline-block rounded-full border border-[var(--blue-018)] bg-[var(--blue-010)] px-2.5 py-0.5 text-xs text-[var(--xiv-blue)]">
          {member.role_title}
        </span>
        {member.bio && (
          <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-[var(--fg-subtle)]">{member.bio}</p>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Add the edit link**

Create `components/team-edit-link.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"

export function TeamEditLink() {
  const { status } = useSession()
  const [onTeam, setOnTeam] = useState(false)

  useEffect(() => {
    if (status !== "authenticated") return
    let live = true
    fetch("/api/team/profile")
      .then((res) => {
        if (live && res.ok) setOnTeam(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [status])

  if (!onTeam) return null
  return (
    <Link
      href="/team/edit"
      className="inline-flex items-center rounded-lg border border-[var(--blue-035)] bg-[var(--blue-010)] px-4 py-2 text-sm text-[var(--xiv-blue)] transition-colors hover:bg-[var(--blue-015)]"
    >
      Edit my card
    </Link>
  )
}
```

- [ ] **Step 3: Add the page**

Create `app/team/page.tsx`:

```tsx
import type { Metadata } from "next"
import { getPublicTeam } from "@/lib/api/xvm-api"
import { groupTeam } from "@/lib/team-groups"
import { TeamRow } from "@/components/team-row"
import { TeamEditLink } from "@/components/team-edit-link"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Meet the team",
  description: "The people who build and run XIV Venue Manager.",
}

export default async function TeamPage() {
  const team = await getPublicTeam().catch(() => null)

  if (!team) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="page-h1 mb-3">Team unavailable</h1>
          <p className="text-muted-foreground">Try again in a moment.</p>
        </div>
      </div>
    )
  }

  const sections = groupTeam(team.members)

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[860px] px-4 pb-20 pt-[120px] sm:px-6">
        <header className="mb-10">
          <h1 className="font-cinzel text-3xl font-bold tracking-wide">Meet the team</h1>
          <p className="mt-2 text-muted-foreground">The people who build and run XIV Venue Manager.</p>
          <div className="mt-4">
            <TeamEditLink />
          </div>
        </header>

        {sections.length === 0 ? (
          <p className="text-muted-foreground">The team page is being set up. Check back soon.</p>
        ) : (
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.label ?? "ungrouped"}>
                {section.label && (
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
                    {section.label}
                  </h2>
                )}
                <div className="space-y-3">
                  {section.members.map((member, index) => (
                    <TeamRow key={`${member.name}-${index}`} member={member} flip={index % 2 === 1} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the sitemap entry**

In `app/sitemap.ts`, add this line directly after the `/stats` entry:

```ts
    { url: `${BASE}/team`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.4 },
```

- [ ] **Step 5: Link it from the footer**

In `components/site-footer.tsx`, add this entry to the "Product" array after `{ label: "Usage stats", href: "/stats" },`:

```tsx
                { label: "Meet the team", href: "/team" },
```

- [ ] **Step 6: Record the shared component**

In `docs/SHARED_ASSETS.md`, add this row to the "Feature components" table, after the `user-picker` row:

```
| `team-row` (`TeamRow`) | One person on the Meet the team page: photo or initials, name, role chip, bio. Used by `/team` and the live preview in `/team/edit` |
```

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: both clean. If lint objects to the `<img>`, mirror the exact comment style used in `app/venues/[slug]/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add components/team-row.tsx components/team-edit-link.tsx app/team/page.tsx app/sitemap.ts components/site-footer.tsx docs/SHARED_ASSETS.md
git commit -m "feat(team): the public Meet the team page"
```

---

## Task 5: Member edit screen and admin screen

**Files:**
- Create: `app/team/edit/page.tsx`
- Create: `app/admin/team/page.tsx`

Verified by `tsc`, lint and the live check in Task 6.

- [ ] **Step 1: Add the member edit page**

Create `app/team/edit/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PageLoading } from "@/components/ui/loading-spinner"
import { TeamRow } from "@/components/team-row"
import { TEAM_BIO_MAX } from "@/lib/team-groups"
import type { TeamProfile } from "@/lib/api/xvm-api"

const PHOTO_TYPES = "image/png,image/jpeg,image/webp,image/gif"

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === "string" ? body.error : fallback
}

export default function EditTeamCardPage() {
  const { status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<TeamProfile | null>(null)
  const [bio, setBio] = useState("")
  const [listed, setListed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [notOnTeam, setNotOnTeam] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/team/profile")
      .then(async (res) => {
        if (res.status === 404) return setNotOnTeam(true)
        if (!res.ok) return setError(await message(res, "Couldn't load your card."))
        const card: TeamProfile = await res.json()
        setProfile(card)
        setBio(card.bio ?? "")
        setListed(card.listed)
      })
      .catch(() => setError("Couldn't reach the server."))
      .finally(() => setLoading(false))
  }, [status])

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/api/team/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bio.trim() === "" ? null : bio, listed }),
      })
      if (!res.ok) return setError(await message(res, "Couldn't save your card."))
      setProfile(await res.json())
      setSaved(true)
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/team/profile/photo", { method: "PUT", body: form })
      if (!res.ok) return setError(await message(res, "Couldn't upload that photo."))
      setProfile(await res.json())
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setBusy(false)
    }
  }

  if (status === "loading" || loading) return <PageLoading />

  if (notOnTeam) {
    return (
      <div className="mx-auto max-w-[640px] px-4 pb-20 pt-[120px] sm:px-6">
        <h1 className="font-cinzel text-2xl font-bold tracking-wide">You are not on the team page</h1>
        <p className="mt-3 text-muted-foreground">An admin adds people to the team. Ask one to add you, then come back here.</p>
        <Link href="/team" className="mt-6 inline-block text-sm text-[var(--xiv-blue)]">
          Back to the team page
        </Link>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[640px] px-4 pb-20 pt-[120px] sm:px-6">
        <p className="text-muted-foreground">{error ?? "Couldn't load your card."}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 pt-[120px] sm:px-6">
      <Link href="/team" className="text-sm text-muted-foreground transition-colors hover:text-[var(--xiv-blue)]">
        ← Back to the team page
      </Link>
      <h1 className="mt-4 font-cinzel text-2xl font-bold tracking-wide">Edit my card</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your role is <strong className="text-foreground">{profile.role_title}</strong>
        {profile.group_label ? ` in ${profile.group_label}` : ""}. An admin sets that.
      </p>

      <div className="mt-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="photo">Photo</Label>
          <input
            id="photo"
            type="file"
            accept={PHOTO_TYPES}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ""
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-[var(--blue-035)] file:bg-[var(--blue-010)] file:px-3 file:py-1.5 file:text-[var(--xiv-blue)]"
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 8 MB. It is shown as a 120px square.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">About you</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={TEAM_BIO_MAX}
            rows={6}
            onChange={(e) => {
              setBio(e.target.value)
              setSaved(false)
            }}
          />
          <p className="text-right text-xs text-muted-foreground">
            {bio.length}/{TEAM_BIO_MAX}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="listed"
            checked={listed}
            onCheckedChange={(value) => {
              setListed(value)
              setSaved(false)
            }}
          />
          <Label htmlFor="listed">Show my card on the team page</Label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
          {saved && <span className="text-sm text-[var(--success-text)]">Saved.</span>}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">Preview</h2>
      <TeamRow member={{ ...profile, bio: bio.trim() === "" ? null : bio }} flip={false} />
    </div>
  )
}
```

- [ ] **Step 2: Add the admin page**

Create `app/admin/team/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageLoading } from "@/components/ui/loading-spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"
import { adminLoadErrorMessage } from "@/lib/admin-load-error"
import type { AdminTeamMember, TeamCandidate } from "@/lib/api/xvm-api"

interface Draft {
  role_title: string
  group_label: string
  sort_order: string
}

const toDraft = (m: AdminTeamMember): Draft => ({
  role_title: m.role_title,
  group_label: m.group_label ?? "",
  sort_order: String(m.sort_order),
})

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === "string" ? body.error : fallback
}

export default function AdminTeamPage() {
  const { status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminTeamMember[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<TeamCandidate[]>([])
  const [picked, setPicked] = useState<TeamCandidate | null>(null)
  const [newRole, setNewRole] = useState("")
  const [newGroup, setNewGroup] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  function load(list: AdminTeamMember[]) {
    setMembers(list)
    setDrafts(Object.fromEntries(list.map((m) => [m.person_id, toDraft(m)])))
  }

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/admin/team")
      .then(async (res) => {
        if (!res.ok) return setLoadError(adminLoadErrorMessage(res.status))
        load(await res.json())
      })
      .catch(() => setLoadError("Couldn't reach the server."))
      .finally(() => setLoading(false))
  }, [status])

  async function search() {
    setError(null)
    setPicked(null)
    if (query.trim().length < 2) return setError("Search for at least two characters.")
    const res = await fetch(`/api/admin/team/candidates?q=${encodeURIComponent(query.trim())}`)
    if (!res.ok) return setError(await message(res, "Search failed."))
    setCandidates(await res.json())
  }

  async function add() {
    if (!picked) return
    setError(null)
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_id: picked.person_id,
        role_title: newRole,
        group_label: newGroup.trim() === "" ? null : newGroup,
        sort_order: members.length,
      }),
    })
    if (!res.ok) return setError(await message(res, "Couldn't add that person."))
    const added: AdminTeamMember = await res.json()
    load([...members, added])
    setPicked(null)
    setCandidates([])
    setQuery("")
    setNewRole("")
    setNewGroup("")
  }

  async function saveRow(member: AdminTeamMember) {
    const draft = drafts[member.person_id]
    setError(null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_title: draft.role_title,
        group_label: draft.group_label.trim() === "" ? null : draft.group_label,
        sort_order: Number(draft.sort_order),
      }),
    })
    if (!res.ok) return setError(await message(res, "Couldn't save that row."))
    const updated: AdminTeamMember = await res.json()
    load(members.map((m) => (m.person_id === updated.person_id ? updated : m)))
  }

  async function remove(member: AdminTeamMember) {
    setError(null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, { method: "DELETE" })
    if (!res.ok) return setError(await message(res, "Couldn't remove that person."))
    load(members.filter((m) => m.person_id !== member.person_id))
  }

  if (status === "loading" || loading) return <PageLoading />

  if (loadError) {
    return (
      <div className="mx-auto max-w-[860px] px-4 pb-20 pt-[120px] sm:px-6">
        <p className="text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[860px] px-4 pb-20 pt-[120px] sm:px-6">
      <h1 className="font-cinzel text-2xl font-bold tracking-wide">Team</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Who is on the Meet the team page, and what they are called there. Sections follow the order of each group&apos;s first
        person by order number.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <section className="mt-8 space-y-3 rounded-xl border border-[var(--blue-018)] bg-card p-4">
        <h2 className="text-sm font-semibold">Add someone</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder="Search by name"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <Button variant="outline" onClick={search}>
            Search
          </Button>
        </div>
        {candidates.length > 0 && !picked && (
          <ul className="divide-y divide-[var(--blue-008)] rounded-md border border-[var(--blue-008)]">
            {candidates.map((c) => (
              <li key={c.person_id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--blue-004)]"
                  onClick={() => setPicked(c)}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="new-role">Role for {picked.name}</Label>
              <Input id="new-role" value={newRole} maxLength={80} onChange={(e) => setNewRole(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-group">Group (optional)</Label>
              <Input id="new-group" value={newGroup} maxLength={40} onChange={(e) => setNewGroup(e.target.value)} />
            </div>
            <Button onClick={add} disabled={newRole.trim() === ""}>
              Add
            </Button>
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        {members.length === 0 && <p className="text-sm text-muted-foreground">Nobody is on the team yet.</p>}
        {members.map((member) => {
          const draft = drafts[member.person_id]
          return (
            <div key={member.person_id} className="rounded-xl border border-[var(--blue-018)] bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-heading font-semibold">{member.name}</span>
                  {!member.listed && <span className="ml-2 text-xs text-muted-foreground">(hidden by them)</span>}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${member.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Their card and photo are deleted. Their account is not touched, and you can add them again later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void remove(member)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`role-${member.person_id}`}>Role</Label>
                  <Input
                    id={`role-${member.person_id}`}
                    value={draft.role_title}
                    maxLength={80}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, role_title: e.target.value } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`group-${member.person_id}`}>Group</Label>
                  <Input
                    id={`group-${member.person_id}`}
                    value={draft.group_label}
                    maxLength={40}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, group_label: e.target.value } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`order-${member.person_id}`}>Order</Label>
                  <Input
                    id={`order-${member.person_id}`}
                    type="number"
                    min={0}
                    value={draft.sort_order}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, sort_order: e.target.value } })}
                  />
                </div>
                <Button variant="outline" onClick={() => void saveRow(member)} disabled={draft.role_title.trim() === ""}>
                  Save
                </Button>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: both clean. If `Button` has no `size="icon"` or `variant="ghost"` here, use the variants that `components/ui/button.tsx` actually exports (read it) rather than inventing new ones.

- [ ] **Step 4: Commit**

```bash
git add app/team/edit/page.tsx app/admin/team/page.tsx
git commit -m "feat(team): member edit screen and admin team screen"
```

---

## Task 6: Verification and PR

- [ ] **Step 1: Static checks and the full suite**

Run: `pnpm run typecheck && pnpm run lint && pnpm test`
Expected: all pass.

- [ ] **Step 2: Bring up the local stack with the xvm-api branch**

Follow `docs/LOCAL_DEV.md`. Run the xvm-api `feat/team-page` worktree (`~/xvm-api-team`) as the local API, apply its migration, and start `pnpm dev` at `localhost:3000`. Sign in as a user who has the `platform_admin` scope (set `is_platform_admin` on that person in the local xvm-api DB, then sign out and in).

- [ ] **Step 3: Click through every path**

At 1280px and again at 375px:
1. `/team` with nobody on the team: shows the "being set up" text, no error.
2. `/admin/team`: search for a second local user (two or more characters), pick them, give a role and a group, Add. The row appears.
3. Add a third person with no group, and a fourth in the same group as the second. Set order numbers so the groups interleave; reload `/team` and confirm sections appear in the order of each group's first person, and the ungrouped person is last.
4. Sign in as an added person: `/team` shows "Edit my card". Open it, upload a photo, write a bio past 1000 characters (the counter and `maxLength` stop it), save, toggle "show my card" off, and confirm the card disappears from `/team` and the admin row says "(hidden by them)".
5. As a person not on the team: `/team` shows no edit link; `/team/edit` shows the "not on the team page" message.
6. As a non-admin: `/admin/team` shows the platform admin message, not a crash.
7. Remove a member: the card and photo are gone, and they can be added again.
8. Browser console on `/team`: no CSP `img-src` violation for the photo. **If there is one**, the xvm-api media host is not allowed; add that origin to `img-src` in `proxy.ts` (mirror how `MINIO_PUBLIC_URL` is appended) and re-check.

Record anything that fails and fix it before continuing. Do not mark this task done on static checks alone; this repo has repeatedly found real bugs only in a live click-through.

- [ ] **Step 4: Stop and confirm before pushing**

Pushing and opening a PR are outward-facing. Ask the user to confirm, then:

```bash
git push -u origin feat/team-page
gh pr create --base dev --title "Meet the team page" --body-file <(printf '%s\n' \
  "The dashboard half of the Meet the team page. Depends on the xvm-api PR that adds \`/public/team\`, \`/me/team-profile\` and \`/admin/team\`." \
  "" \
  "- Public \`/team\`: editorial rows under group headings, in the sitemap and the footer" \
  "- \`/team/edit\`: members change their photo, bio and listing; role and group are read-only" \
  "- \`/admin/team\`: add people by name search, edit role, group and order, remove" \
  "" \
  "Design: \`docs/superpowers/specs/2026-10-29-meet-the-team-design.md\`" \
  "" \
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

Always pass `--base dev`. Allegro merges dashboard PRs unless they are the user's own; per the standing rule, wait for her re-look after any fix push rather than merging on green CI alone.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Public `/team`, server-rendered editorial rows, alternating sides, stack at 375px | 4 |
| Group headings from `group_label`, first-appearance order, ungrouped last | 1, 4 |
| Empty-team placeholder; initials placeholder with no photo | 4 |
| In `sitemap.ts` with metadata, linked from the footer | 4 |
| "Edit my card" only for members | 4 (`TeamEditLink`) |
| `/team/edit`: photo, bio with 1000 counter, listing toggle, live preview, role/group read-only | 5 |
| `/admin/team`: list incl. hidden, add by name search, inline role/group/order, remove with confirm | 5 |
| Same platform-admin gate as other `/admin` pages | 3, 5 (xvm-api 403 + `adminLoadErrorMessage`) |
| Reads through xvm-api only, no Prisma | 2, 3 |
| vitest, `tsc`, lint, live click-through | 1-3 (tests), 5-6 (checks) |
| Open item: photo rendering | resolved: plain `<img>` as the venue page does |
| Open item: admin person search | resolved: `searchTeamCandidates` over the new xvm-api endpoint |

Names are consistent across tasks: `groupTeam`, `initials`, `TEAM_BIO_MAX`, `TeamRow`, `TeamEditLink`, and the client functions `getPublicTeam`, `getMyTeamProfile`, `updateMyTeamProfile`, `setMyTeamPhoto`, `listAdminTeam`, `addTeamMember`, `updateTeamMember`, `removeTeamMember`, `searchTeamCandidates`.
