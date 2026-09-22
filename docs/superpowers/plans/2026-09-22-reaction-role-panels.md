# Reaction-Role Panels Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give venue managers a dashboard screen to create, edit, and post reaction-role panels, and apply platform templates — the bot side already works, the dashboard has no UI for this feature at all.

**Architecture:** Server component page (session+venue guard, fetches initial data) → client board component → Next.js API proxy routes (session-gated, hold the `personToken`) → `lib/api/xvm-api.ts` client → xvm-api backend. Two of the proxy actions (`from-template`, `post to channel`) are async (202, bot does the work) — the client polls a read endpoint briefly and shows a toast, no new infra.

**Tech Stack:** Next.js 16 app router, React 19, TypeScript strict, `sonner` toasts, shadcn `Dialog`/`AlertDialog`/`Select`/`Card`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-09-22-reaction-role-panels-design.md`

---

## Task 1: Fix `xvmFetch` to handle 202 responses with no body

Two new endpoints this feature needs (`POST /from-template`, `POST /{panel_id}/posts`) return `202` with an empty body. `xvmFetch` currently only special-cases `204` — calling `res.json()` on an empty `202` body throws `SyntaxError: Unexpected end of JSON input`. This is a foundational fix every later task depends on.

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts:286-305` (the `xvmFetch` function)
- Test: `apps/web/lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/api/xvm-api.test.ts`, in a new `describe` block right after the existing `beforeEach` setup (before the first feature-specific `describe`). Use `deleteRoom` (already imported) as the vehicle — the fix is generic in `xvmFetch`, not per-endpoint, so any thin void-returning wrapper proves it without adding a throwaway export just for the test:

```typescript
describe("xvmFetch 202 handling", () => {
  it("does not throw on a 202 with an empty body", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => {
        throw new Error("should not be called for a 202")
      },
      text: async () => "",
    } as Response)
    await expect(deleteRoom("token", "venue-1", 1)).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run lib/api/xvm-api.test.ts -t "202"`
Expected: FAIL — `SyntaxError: Unexpected end of JSON input` (or similar), because `xvmFetch` calls `res.json()` on the empty 202 body.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/lib/api/xvm-api.ts`, change the last line of `xvmFetch`:

```typescript
  // 204 (no content) and 202 (accepted - bot does the work async, no body)
  // both come back with nothing to parse; res.json() throws on an empty body.
  return res.status === 204 || res.status === 202 ? (null as T) : res.json()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run lib/api/xvm-api.test.ts -t "202"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api.test.ts
git commit -m "fix(xvm-api): handle 202 Accepted responses with no body

POST /from-template and POST /{panel_id}/posts (added in a later commit)
return 202 with an empty body once the bot picks up the request. xvmFetch
only special-cased 204, so it called res.json() on nothing and threw.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `xvm-api.ts` client functions for reaction-role panels

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (add a new `// ── Reaction Role Panels API ─────` section right after the Rooms API section, which ends after `uploadRoomImage`, before `// ── Contests API`)
- Test: `apps/web/lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these names to the existing `import { ... } from "./xvm-api"` value-import block and `type ... } from "./xvm-api"` type-import block at the top of `apps/web/lib/api/xvm-api.test.ts`:

```typescript
  listPanels,
  createPanel,
  getPanel,
  updatePanel,
  deletePanel,
  addPanelOption,
  updatePanelOption,
  deletePanelOption,
  applyPanelTemplate,
  postPanel,
  listPanelPosts,
  listReactionRoleTemplates,
  type PanelRow,
  type TemplateRow,
```

Then add a new `describe` block:

```typescript
describe("Reaction Role Panels API", () => {
  const samplePanel: PanelRow = {
    id: 1,
    title: "Pronouns",
    description: null,
    thumbnail_url: null,
    color: null,
    message_type: "normal",
    options: [{ id: 1, role_id: "111", label: "she/her", emoji: null, sort_order: 0 }],
    created_at: "2026-09-22T00:00:00Z",
    updated_at: "2026-09-22T00:00:00Z",
  }

  it("listPanels GETs the venue's panels", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [samplePanel] })
    const result = await listPanels("token", "venue-1")
    expect(result).toEqual([samplePanel])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/reaction-role-panels")
  })

  it("createPanel POSTs to /venues/{venueId}/reaction-role-panels", async () => {
    mockFetchOnce({ ok: true, status: 201, body: samplePanel })
    const result = await createPanel("token", "venue-1", { title: "Pronouns" })
    expect(result).toEqual(samplePanel)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels")
    expect(options.method).toBe("POST")
  })

  it("getPanel GETs /reaction-role-panels/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: samplePanel })
    await getPanel("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1")
  })

  it("updatePanel PATCHes /reaction-role-panels/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: samplePanel })
    await updatePanel("token", "venue-1", 1, { title: "Updated" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1")
    expect(options.method).toBe("PATCH")
  })

  it("deletePanel DELETEs /reaction-role-panels/{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deletePanel("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1")
    expect(options.method).toBe("DELETE")
  })

  it("addPanelOption POSTs /reaction-role-panels/{id}/options", async () => {
    mockFetchOnce({ ok: true, status: 201, body: samplePanel.options[0] })
    await addPanelOption("token", "venue-1", 1, { role_id: "111", label: "she/her" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1/options")
    expect(options.method).toBe("POST")
  })

  it("updatePanelOption PATCHes /reaction-role-panels/{id}/options/{optionId}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: samplePanel.options[0] })
    await updatePanelOption("token", "venue-1", 1, 1, { label: "she/they" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1/options/1")
    expect(options.method).toBe("PATCH")
  })

  it("deletePanelOption DELETEs /reaction-role-panels/{id}/options/{optionId}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deletePanelOption("token", "venue-1", 1, 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1/options/1")
    expect(options.method).toBe("DELETE")
  })

  it("applyPanelTemplate POSTs /reaction-role-panels/from-template and tolerates a 202 empty body", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => {
        throw new Error("should not be called for a 202")
      },
      text: async () => "",
    } as Response)
    await applyPanelTemplate("token", "venue-1", { template_id: 1, channel_id: "222" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/from-template")
    expect(options.method).toBe("POST")
  })

  it("postPanel POSTs /reaction-role-panels/{id}/posts and tolerates a 202 empty body", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => {
        throw new Error("should not be called for a 202")
      },
      text: async () => "",
    } as Response)
    await postPanel("token", "venue-1", 1, { channel_id: "222" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1/posts")
    expect(options.method).toBe("POST")
  })

  it("listPanelPosts GETs /reaction-role-panels/{id}/posts", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listPanelPosts("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-panels/1/posts")
  })

  it("listReactionRoleTemplates GETs the flat, non-venue-scoped /reaction-role-templates", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listReactionRoleTemplates("token")
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/reaction-role-templates")
    expect(url).not.toContain("/venues/")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/api/xvm-api.test.ts -t "Reaction Role Panels API"`
Expected: FAIL — `listPanels is not defined` (and similar) for every new function, since none exist yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/lib/api/xvm-api.ts`, insert this new section right after the Rooms API section (after `uploadRoomImage`, before `// ── Contests API`):

```typescript
// ── Reaction Role Panels API ─────────────────────────────────────

export interface ReactionRoleOptionRow {
  id: number
  role_id: string
  label: string | null
  emoji: string | null
  sort_order: number
}

export interface PanelRow {
  id: number
  title: string | null
  description: string | null
  thumbnail_url: string | null
  color: number | null
  message_type: "normal" | "unique" | "verify"
  options: ReactionRoleOptionRow[]
  created_at: string
  updated_at: string
}

export interface PanelPostRow {
  channel_id: string
  message_id: string | null
  posted_at: string | null
}

export interface TemplateOptionRow {
  id: number
  name: string
  color: number
  emoji: string | null
  sort_order: number
}

export interface TemplateRow {
  id: number
  name: string
  title: string
  description: string | null
  message_type: "normal" | "unique" | "verify"
  options: TemplateOptionRow[]
  created_at: string
  updated_at: string
}

export interface PanelCreateData {
  title: string
  description?: string | null
  color?: number | null
  message_type?: "normal" | "unique" | "verify"
}

export interface PanelUpdateData {
  title?: string
  description?: string | null
  color?: number | null
  message_type?: "normal" | "unique" | "verify"
}

export interface PanelOptionCreateData {
  role_id: string
  label?: string | null
  emoji?: string | null
}

export interface PanelOptionUpdateData {
  label?: string | null
  emoji?: string | null
}

export async function listPanels(personToken: string, venueId: string): Promise<PanelRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow[]>(`/venues/${venueId}/reaction-role-panels`, {}, personToken)
}

export async function getPanel(personToken: string, venueId: string, panelId: number): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(`/venues/${venueId}/reaction-role-panels/${panelId}`, {}, personToken)
}

export async function createPanel(personToken: string, venueId: string, data: PanelCreateData): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePanel(
  personToken: string,
  venueId: string,
  panelId: number,
  data: PanelUpdateData
): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePanel(personToken: string, venueId: string, panelId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/reaction-role-panels/${panelId}`, { method: "DELETE" }, personToken)
}

export async function setPanelThumbnail(
  personToken: string,
  venueId: string,
  panelId: number,
  file: File | Blob
): Promise<PanelRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<PanelRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/thumbnail`,
    { method: "PUT", body: form },
    personToken
  )
}

export async function addPanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  data: PanelOptionCreateData
): Promise<ReactionRoleOptionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ReactionRoleOptionRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  optionId: number,
  data: PanelOptionUpdateData
): Promise<ReactionRoleOptionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<ReactionRoleOptionRow>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options/${optionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function deletePanelOption(
  personToken: string,
  venueId: string,
  panelId: number,
  optionId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/options/${optionId}`,
    { method: "DELETE" },
    personToken
  )
}

// Both endpoints below return 202 with no body - the bot does the work
// asynchronously. Callers poll listPanels/listPanelPosts to find out.

export async function applyPanelTemplate(
  personToken: string,
  venueId: string,
  data: { template_id: number; channel_id: string }
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/from-template`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function postPanel(
  personToken: string,
  venueId: string,
  panelId: number,
  data: { channel_id: string }
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/reaction-role-panels/${panelId}/posts`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function listPanelPosts(personToken: string, venueId: string, panelId: number): Promise<PanelPostRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PanelPostRow[]>(`/venues/${venueId}/reaction-role-panels/${panelId}/posts`, {}, personToken)
}

// Not venue-scoped in xvm-api - templates are a flat, platform-wide catalog
// (admin_router with no prefix). Read-only here; creation is platform-admin-only.
export async function listReactionRoleTemplates(personToken: string): Promise<TemplateRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TemplateRow[]>("/reaction-role-templates", {}, personToken)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/api/xvm-api.test.ts -t "Reaction Role Panels API"`
Expected: PASS, all 12 cases.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd apps/web && pnpm run typecheck && pnpm run test`
Expected: both clean, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts apps/web/lib/api/xvm-api.test.ts
git commit -m "feat(xvm-api): add reaction-role panel client functions

listPanels/createPanel/getPanel/updatePanel/deletePanel, option CRUD,
setPanelThumbnail, applyPanelTemplate/postPanel (both 202-async),
listPanelPosts, and listReactionRoleTemplates (flat, not venue-scoped -
templates are a platform-wide catalog).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Proxy routes — panel list/create and get/update/delete

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/route.ts`

No test file — verified in Task 2's spec-review pass that no proxy route in this codebase has direct test coverage (Rooms, Contests, Tasks all untested at this layer); this stays consistent rather than introducing a new standard alone.

- [ ] **Step 1: Create the list/create route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPanels, createPanel } from "@/lib/api/xvm-api"

const createPanelSchema = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().max(4096).nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  messageType: z.enum(["normal", "unique", "verify"]).optional(),
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const panels = await listPanels(token, gate.xvmApiVenueId!)
      return NextResponse.json(panels)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createPanelSchema>
    try {
      data = createPanelSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const panel = await createPanel(token, gate.xvmApiVenueId!, {
        title: data.title,
        description: data.description ?? null,
        color: data.color ?? null,
        message_type: data.messageType,
      })
      return NextResponse.json(panel, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 2: Create the get/update/delete route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getPanel, updatePanel, deletePanel } from "@/lib/api/xvm-api"

const updatePanelSchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  description: z.string().trim().max(4096).nullable().optional(),
  color: z.number().int().min(0).max(0xffffff).nullable().optional(),
  messageType: z.enum(["normal", "unique", "verify"]).optional(),
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const panel = await getPanel(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updatePanelSchema>
    try {
      data = updatePanelSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const panel = await updatePanel(token, gate.xvmApiVenueId!, id, {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.messageType !== undefined && { message_type: data.messageType }),
      })
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deletePanel(token, gate.xvmApiVenueId!, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/reaction-role-panels/route.ts" \
        "apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/route.ts"
git commit -m "feat(dashboard): reaction-role panel list/create/get/update/delete proxy routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Proxy routes — panel options

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/options/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/options/[optionId]/route.ts`

- [ ] **Step 1: Create the add-option route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/options/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { addPanelOption } from "@/lib/api/xvm-api"

// Discord snowflakes are unsigned 64-bit ints serialized as strings - never
// coerce to number, real IDs exceed Number.MAX_SAFE_INTEGER.
const snowflake = z.string().regex(/^\d+$/, "Must be a numeric Discord ID")

const addOptionSchema = z
  .object({
    roleId: snowflake,
    label: z.string().trim().min(1).max(80).nullable().optional(),
    emoji: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((data) => data.label || data.emoji, { message: "A button needs a label or an emoji." })

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof addOptionSchema>
    try {
      data = addOptionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await addPanelOption(token, gate.xvmApiVenueId!, id, {
        role_id: data.roleId,
        label: data.label ?? null,
        emoji: data.emoji ?? null,
      })
      return NextResponse.json(option, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Create the update/delete-option route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/options/[optionId]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updatePanelOption, deletePanelOption } from "@/lib/api/xvm-api"

const updateOptionSchema = z.object({
  label: z.string().trim().min(1).max(80).nullable().optional(),
  emoji: z.string().trim().min(1).max(64).nullable().optional(),
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; panelId: string; optionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId, optionId } = await context.params
    const pId = parseId(panelId)
    const oId = parseId(optionId)
    if (pId === null || oId === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateOptionSchema>
    try {
      data = updateOptionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await updatePanelOption(token, gate.xvmApiVenueId!, pId, oId, {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.emoji !== undefined && { emoji: data.emoji }),
      })
      return NextResponse.json(option)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; panelId: string; optionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId, optionId } = await context.params
    const pId = parseId(panelId)
    const oId = parseId(optionId)
    if (pId === null || oId === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deletePanelOption(token, gate.xvmApiVenueId!, pId, oId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/options/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/options"
git commit -m "feat(dashboard): reaction-role panel option add/update/delete proxy routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Proxy routes — post-to-channel, apply-template, templates (read-only)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/posts/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/from-template/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/templates/route.ts`

- [ ] **Step 1: Create the posts route (list + post-to-channel)**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/posts/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPanelPosts, postPanel } from "@/lib/api/xvm-api"

const snowflake = z.string().regex(/^\d+$/, "Must be a numeric Discord ID")
const postSchema = z.object({ channelId: snowflake })

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const posts = await listPanelPosts(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(posts)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/posts] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof postSchema>
    try {
      data = postSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      // 202, no body - the bot does the work. See lib/api/xvm-api.ts's postPanel.
      await postPanel(token, gate.xvmApiVenueId!, id, { channel_id: data.channelId })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/posts] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Create the apply-template route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/from-template/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { applyPanelTemplate } from "@/lib/api/xvm-api"

const snowflake = z.string().regex(/^\d+$/, "Must be a numeric Discord ID")
const applyTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  channelId: snowflake,
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof applyTemplateSchema>
    try {
      data = applyTemplateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      // 202, no body - the bot builds the panel. See lib/api/xvm-api.ts's applyPanelTemplate.
      await applyPanelTemplate(token, gate.xvmApiVenueId!, {
        template_id: data.templateId,
        channel_id: data.channelId,
      })
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/from-template] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 3: Create the read-only templates route**

`apps/web/app/api/venues/[venueId]/reaction-role-panels/templates/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listReactionRoleTemplates } from "@/lib/api/xvm-api"

// venueId in the URL is unused - xvm-api's template catalog is flat and
// platform-wide, not venue-scoped - but the route lives under the venue
// path for URL consistency with the rest of this feature's dashboard routes.
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const templates = await listReactionRoleTemplates(token)
      return NextResponse.json(templates)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/templates] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/posts" \
        "apps/web/app/api/venues/[venueId]/reaction-role-panels/from-template" \
        "apps/web/app/api/venues/[venueId]/reaction-role-panels/templates"
git commit -m "feat(dashboard): post-to-channel, apply-template, and read-only templates proxy routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Proxy route — thumbnail upload

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/thumbnail/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { setPanelThumbnail } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

function parsePanelId(panelId: string) {
  const id = Number(panelId)
  return Number.isInteger(id) ? id : null
}

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; panelId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, panelId } = await context.params
    const id = parsePanelId(panelId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }

    try {
      const panel = await setPanelThumbnail(token, gate.xvmApiVenueId!, id, file)
      return NextResponse.json(panel)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/:id/thumbnail] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/reaction-role-panels/[panelId]/thumbnail"
git commit -m "feat(dashboard): reaction-role panel thumbnail upload proxy route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Sidebar entry

**Files:**
- Modify: `apps/web/components/venue-sidebar.tsx`

- [ ] **Step 1: Add the icon import**

In the `lucide-react` import block (`apps/web/components/venue-sidebar.tsx:12-33`), add `Smile` alongside the existing icons:

```typescript
import {
  Heart,
  Home,
  BarChart3,
  Calendar,
  Radio,
  Users,
  Clock,
  CheckSquare,
  ShoppingBag,
  Gift,
  Coins,
  Scroll,
  History,
  Wallet,
  Settings,
  Compass,
  BookHeart,
  Ban,
  DoorOpen,
  Smile,
  type LucideIcon,
  // ... (rest of the existing import list unchanged)
```

- [ ] **Step 2: Add the nav entry**

In the `Manage` group (`apps/web/components/venue-sidebar.tsx:~258-272`), add a `Reaction Roles` entry after `Live Mode`:

```typescript
    {
      label: "Manage",
      items: [
        { href: `/dashboard/${venueSlug}`, label: "Overview", icon: Home },
        {
          href: `/dashboard/${venueSlug}/analytics`,
          label: "Analytics",
          icon: BarChart3,
          roles: ["OWNER", "MANAGER"],
        },
        {
          href: `/dashboard/${venueSlug}/live`,
          label: "Live Mode",
          icon: Radio,
          badge: livePatronCount,
        },
        {
          href: `/dashboard/${venueSlug}/reaction-roles`,
          label: "Reaction Roles",
          icon: Smile,
          roles: ["OWNER", "MANAGER"],
        },
      ],
    },
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/venue-sidebar.tsx
git commit -m "feat(dashboard): add Reaction Roles sidebar entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Server page

**Files:**
- Create: `apps/web/app/dashboard/[slug]/reaction-roles/page.tsx`

- [ ] **Step 1: Create the page**

Follows `rooms/page.tsx`'s exact server-component pattern, fetching panels and the read-only template list in parallel.

```typescript
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { ReactionRolePanelsBoard } from "@/components/reaction-role-panels-board"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { listPanels, listReactionRoleTemplates, type PanelRow, type TemplateRow } from "@/lib/api/xvm-api"

export default async function ReactionRolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role

  let panels: PanelRow[] = []
  let templates: TemplateRow[] = []
  const notConnected = !venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (token && venue.xvmApiVenueId) {
    try {
      ;[panels, templates] = await Promise.all([
        listPanels(token, venue.xvmApiVenueId),
        listReactionRoleTemplates(token),
      ])
    } catch (err) {
      console.error("[reaction-roles page] listPanels/listReactionRoleTemplates error:", err)
      if (isXvmAuthFailure(err)) {
        await invalidateXvmApiCredential(session.user.id)
      }
    }
  }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Reaction Roles</h1>
        </div>

        <ReactionRolePanelsBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          panels={panels}
          templates={templates}
          notConnected={notConnected}
        />
      </div>
    </VenueLayout>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: FAIL — `ReactionRolePanelsBoard` doesn't exist yet. That's expected; Task 9 creates it. Confirm the *only* error is the missing component, not something else in this file.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/reaction-roles/page.tsx"
git commit -m "feat(dashboard): reaction roles server page

Depends on ReactionRolePanelsBoard, added next - this alone doesn't
typecheck clean yet by design.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `ReactionRolePanelsBoard` component

**Files:**
- Create: `apps/web/components/reaction-role-panels-board.tsx`

This is the list view: card grid, post-to-channel (async), delete confirm. Create/edit and apply-template are separate dialogs, added in Tasks 10 and 11, imported here.

- [ ] **Step 1: Create the component**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ReactionRolePanelFormDialog } from "@/components/reaction-role-panel-form-dialog"
import { ApplyTemplateDialog } from "@/components/apply-template-dialog"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, PanelPostRow, TemplateRow } from "@/lib/api/xvm-api"

export interface ReactionRolePanelsBoardProps {
  venueId: string
  canManage: boolean
  panels: PanelRow[]
  templates: TemplateRow[]
  notConnected?: boolean
}

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."
const SNOWFLAKE_PATTERN = /^\d+$/
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function ReactionRolePanelsBoard({
  venueId,
  canManage,
  panels: initialPanels,
  templates,
  notConnected,
}: ReactionRolePanelsBoardProps) {
  const [panels, setPanels] = useState<PanelRow[]>(initialPanels)
  const [deleteTarget, setDeleteTarget] = useState<PanelRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [postTarget, setPostTarget] = useState<PanelRow | null>(null)
  const [postChannelId, setPostChannelId] = useState("")
  const [posting, setPosting] = useState(false)

  function handleCreated(panel: PanelRow) {
    setPanels((prev) => [panel, ...prev])
  }

  function handleUpdated(panel: PanelRow) {
    setPanels((prev) => prev.map((p) => (p.id === panel.id ? panel : p)))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${deleteTarget.id}`, { method: "DELETE" })
      setPanels((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      toast.success("Panel deleted.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete panel.")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function confirmPost() {
    if (!postTarget) return
    if (!SNOWFLAKE_PATTERN.test(postChannelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }
    setPosting(true)
    const toastId = toast.loading("Asking the bot...")
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${postTarget.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: postChannelId }),
      })

      const deadline = Date.now() + POLL_TIMEOUT_MS
      let found = false
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        const posts = await apiFetch<PanelPostRow[]>(
          `/api/venues/${venueId}/reaction-role-panels/${postTarget.id}/posts`
        )
        if (posts.some((p) => p.channel_id === postChannelId)) {
          found = true
          break
        }
      }

      if (found) {
        toast.success("Panel posted.", { id: toastId })
      } else {
        toast.info("Still working — refresh in a moment.", { id: toastId })
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to post panel.", { id: toastId })
    } finally {
      setPosting(false)
      setPostTarget(null)
      setPostChannelId("")
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex gap-2">
          <ReactionRolePanelFormDialog venueId={venueId} onCreated={handleCreated} onUpdated={handleUpdated} />
          <ApplyTemplateDialog venueId={venueId} templates={templates} />
        </div>
      )}

      {panels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reaction-role panels yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {panels.map((panel) => (
            <Card key={panel.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <Badge variant="tag">{panel.message_type}</Badge>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{panel.title ?? `#${panel.id}`}</p>
                {panel.description && <p className="text-sm text-muted-foreground">{panel.description}</p>}
                <ul className="text-sm mt-2 space-y-1">
                  {panel.options.map((opt) => (
                    <li key={opt.id} className="flex items-center gap-2">
                      <span>{opt.emoji ?? "•"}</span>
                      <span>{opt.label ?? "(no label)"}</span>
                      <span className="text-muted-foreground text-xs">role {opt.role_id}</span>
                    </li>
                  ))}
                </ul>

                {canManage && (
                  <div className="flex gap-2 mt-3">
                    <ReactionRolePanelFormDialog
                      venueId={venueId}
                      panel={panel}
                      onCreated={handleCreated}
                      onUpdated={handleUpdated}
                      trigger={
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => setPostTarget(panel)}>
                      Post to channel
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(panel)}>
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Every posted copy of this panel comes down first. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!postTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPostTarget(null)
            setPostChannelId("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post "{postTarget?.title}" to a channel</AlertDialogTitle>
            <AlertDialogDescription>Enter the Discord channel ID to post this panel to.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Channel ID"
            value={postChannelId}
            onChange={(e) => setPostChannelId(e.target.value)}
            disabled={posting}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPost} disabled={posting || !postChannelId}>
              {posting ? "Posting..." : "Post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: FAIL — `ReactionRolePanelFormDialog` and `ApplyTemplateDialog` don't exist yet (Tasks 10, 11). Confirm no other errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/reaction-role-panels-board.tsx
git commit -m "feat(dashboard): reaction-role panels board (list, delete, post-to-channel)

Depends on ReactionRolePanelFormDialog and ApplyTemplateDialog, added
next - this alone doesn't typecheck clean yet by design.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `ReactionRolePanelFormDialog` component

**Files:**
- Create: `apps/web/components/reaction-role-panel-form-dialog.tsx`

Create/edit dialog: title/description/color/message_type, plus a repeatable options list (role_id/label/emoji). Options are managed against the live API once a panel exists (create panel first, then add options one at a time) — matching how `RoomsBoard` manages sub-resources (reservations) only after the parent exists.

- [ ] **Step 1: Create the component**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, ReactionRoleOptionRow } from "@/lib/api/xvm-api"

const SNOWFLAKE_PATTERN = /^\d+$/

interface ReactionRolePanelFormDialogProps {
  venueId: string
  panel?: PanelRow
  trigger?: React.ReactNode
  onCreated: (panel: PanelRow) => void
  onUpdated: (panel: PanelRow) => void
}

interface DraftOption {
  roleId: string
  label: string
  emoji: string
}

export function ReactionRolePanelFormDialog({
  venueId,
  panel,
  trigger,
  onCreated,
  onUpdated,
}: ReactionRolePanelFormDialogProps) {
  const isEdit = !!panel
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState(panel?.title ?? "")
  const [description, setDescription] = useState(panel?.description ?? "")
  const [color, setColor] = useState(panel?.color != null ? `#${panel.color.toString(16).padStart(6, "0")}` : "#5865f2")
  const [messageType, setMessageType] = useState<"normal" | "unique" | "verify">(panel?.message_type ?? "normal")
  const [options, setOptions] = useState<ReactionRoleOptionRow[]>(panel?.options ?? [])
  const [draft, setDraft] = useState<DraftOption>({ roleId: "", label: "", emoji: "" })
  const [savedPanelId, setSavedPanelId] = useState<number | null>(panel?.id ?? null)

  function reset() {
    setTitle(panel?.title ?? "")
    setDescription(panel?.description ?? "")
    setColor(panel?.color != null ? `#${panel.color.toString(16).padStart(6, "0")}` : "#5865f2")
    setMessageType(panel?.message_type ?? "normal")
    setOptions(panel?.options ?? [])
    setSavedPanelId(panel?.id ?? null)
    setDraft({ roleId: "", label: "", emoji: "" })
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      toast.error("Please enter a title")
      return
    }

    setSubmitting(true)
    try {
      const body = {
        title: trimmedTitle,
        description: description.trim() || null,
        color: parseInt(color.replace("#", ""), 16),
        messageType,
      }

      if (isEdit && savedPanelId) {
        const updated = await apiFetch<PanelRow>(`/api/venues/${venueId}/reaction-role-panels/${savedPanelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        onUpdated({ ...updated, options })
        toast.success("Panel updated.")
        setOpen(false)
      } else if (savedPanelId) {
        // Panel already created in an earlier step of this same dialog session
        // (adding an option creates it first) - nothing left to save at the
        // panel level, options are added individually below.
        toast.success("Panel saved.")
        setOpen(false)
      } else {
        const created = await apiFetch<PanelRow>(`/api/venues/${venueId}/reaction-role-panels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        setSavedPanelId(created.id)
        onCreated(created)
        toast.success("Panel created — add options below, then close when done.")
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save panel.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddOption() {
    if (!savedPanelId) {
      toast.error("Save the panel first before adding options.")
      return
    }
    if (!SNOWFLAKE_PATTERN.test(draft.roleId)) {
      toast.error("Role ID must be numeric.")
      return
    }
    if (!draft.label.trim() && !draft.emoji.trim()) {
      toast.error("An option needs a label or an emoji.")
      return
    }

    try {
      const option = await apiFetch<ReactionRoleOptionRow>(
        `/api/venues/${venueId}/reaction-role-panels/${savedPanelId}/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: draft.roleId,
            label: draft.label.trim() || null,
            emoji: draft.emoji.trim() || null,
          }),
        }
      )
      setOptions((prev) => [...prev, option])
      setDraft({ roleId: "", label: "", emoji: "" })
      toast.success("Option added.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add option.")
    }
  }

  async function handleDeleteOption(optionId: number) {
    if (!savedPanelId) return
    try {
      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/${savedPanelId}/options/${optionId}`, {
        method: "DELETE",
      })
      setOptions((prev) => prev.filter((o) => o.id !== optionId))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove option.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger ?? <Button>+ New Panel</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Panel" : "New Reaction Role Panel"}</DialogTitle>
          <DialogDescription>Configure the panel, then add one row per role.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="panel-title">Title</Label>
            <Input id="panel-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="panel-description">Description</Label>
            <Textarea
              id="panel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="panel-color">Color</Label>
              <Input
                id="panel-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel-message-type">Button behavior</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as typeof messageType)}>
                <SelectTrigger id="panel-message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (toggle)</SelectItem>
                  <SelectItem value="unique">Unique (one at a time)</SelectItem>
                  <SelectItem value="verify">Verify (grant only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Options</Label>
            {options.length === 0 && <p className="text-sm text-muted-foreground">No options yet.</p>}
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2 text-sm">
                <span>{opt.emoji ?? "•"}</span>
                <span className="flex-1">{opt.label ?? "(no label)"}</span>
                <span className="text-muted-foreground text-xs">role {opt.role_id}</span>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteOption(opt.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Role ID"
                value={draft.roleId}
                onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                disabled={!savedPanelId}
              />
              <Input
                placeholder="Label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                disabled={!savedPanelId}
              />
              <Input
                placeholder="Emoji"
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                disabled={!savedPanelId}
              />
              <Button type="button" variant="outline" onClick={handleAddOption} disabled={!savedPanelId}>
                Add
              </Button>
            </div>
            {!savedPanelId && (
              <p className="text-xs text-muted-foreground">Save the panel first to add options.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            {savedPanelId && !isEdit ? "Done" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Save Changes" : savedPanelId ? "Save Details" : "Create Panel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm run typecheck`
Expected: FAIL — `ApplyTemplateDialog` still missing (Task 11). No other errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/reaction-role-panel-form-dialog.tsx
git commit -m "feat(dashboard): reaction-role panel create/edit dialog with option management

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `ApplyTemplateDialog` component

**Files:**
- Create: `apps/web/components/apply-template-dialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
import type { PanelRow, TemplateRow } from "@/lib/api/xvm-api"

const SNOWFLAKE_PATTERN = /^\d+$/
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 15000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ApplyTemplateDialogProps {
  venueId: string
  templates: TemplateRow[]
}

export function ApplyTemplateDialog({ venueId, templates }: ApplyTemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>("")
  const [channelId, setChannelId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setTemplateId("")
    setChannelId("")
  }

  async function handleSubmit() {
    if (!templateId) {
      toast.error("Choose a template.")
      return
    }
    if (!SNOWFLAKE_PATTERN.test(channelId)) {
      toast.error("Channel ID must be numeric.")
      return
    }

    setSubmitting(true)
    const toastId = toast.loading("Asking the bot...")
    try {
      const before = await apiFetch<PanelRow[]>(`/api/venues/${venueId}/reaction-role-panels`)
      const beforeIds = new Set(before.map((p) => p.id))

      await apiFetch(`/api/venues/${venueId}/reaction-role-panels/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: Number(templateId), channelId }),
      })

      const deadline = Date.now() + POLL_TIMEOUT_MS
      let found = false
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        const after = await apiFetch<PanelRow[]>(`/api/venues/${venueId}/reaction-role-panels`)
        if (after.some((p) => !beforeIds.has(p.id))) {
          found = true
          break
        }
      }

      if (found) {
        toast.success("Template applied — reload to see the new panel.", { id: toastId })
      } else {
        toast.info("Still working — refresh in a moment.", { id: toastId })
      }
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to apply template.", { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Apply Template</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply a Template</DialogTitle>
          <DialogDescription>The bot creates the roles and builds the panel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-select">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="template-select">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.options.length} role{t.options.length === 1 ? "" : "s"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-channel">Channel ID</Label>
            <Input
              id="template-channel"
              placeholder="Channel ID"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck the whole feature**

Run: `cd apps/web && pnpm run typecheck`
Expected: clean — this was the last missing piece Tasks 8/9 depended on.

- [ ] **Step 3: Run the full test suite**

Run: `cd apps/web && pnpm run test`
Expected: all pass, including the new Task 1/Task 2 cases.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/apply-template-dialog.tsx
git commit -m "feat(dashboard): apply-template dialog with async poll UX

Completes the reaction-role panels feature - typecheck and test suite
both clean end to end.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Live verification

**Files:** none — verification only, per this repo's CLAUDE.md planning bar ("verify with tsc + vitest + a live check against the running local dev server before calling something done").

- [ ] **Step 1: Start the local stack**

Run (from repo root): `docker compose -f docker-compose.local.yml up -d`
Run: `pnpm install && cd apps/web && pnpm dev`

- [ ] **Step 2: Sign in and navigate**

Sign in at `http://localhost:3000/auth/signin`, open a disposable local test venue that's connected to xvm-api (has `xvmApiVenueId` set), navigate to `/dashboard/<slug>/reaction-roles`.

- [ ] **Step 3: Click through the golden path**

1. Confirm the sidebar shows "Reaction Roles" under Manage, for an OWNER/MANAGER account.
2. Create a panel (title, description, color, message type).
3. Add an option with a real role ID from the test Discord server, a label, and an emoji.
4. Edit the panel's title, confirm the card updates.
5. Post the panel to a real channel ID, confirm the "Asking the bot..." toast resolves to success (or times out gracefully if the bot is slow/offline — check for the "Still working" toast instead of a crash).
6. Apply a template (seed one via xvm-api's admin endpoint first if none exist locally), confirm the same async toast behavior.
7. Delete the panel, confirm the `AlertDialog` warns about posted copies and the card disappears after confirming.

- [ ] **Step 4: Check edge cases**

1. Sign in as a STAFF (non-manager) member — confirm no Create/Edit/Delete/Post/Apply-Template affordances render, but the panel list itself is still visible.
2. Enter a non-numeric channel ID or role ID — confirm the client-side regex check blocks the request before it fires (check Network tab).
3. Disconnect the venue from xvm-api (or use a venue with no `xvmApiVenueId`) — confirm the "Ask the venue owner..." message renders instead of a crash.

- [ ] **Step 5: Report results**

If anything in Steps 3-4 doesn't behave as designed, fix it before moving to Task 13 (PR). Note any deviations from the spec explicitly, rather than silently patching around them.

---

## Task 13: Open the PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/reaction-role-panels
```

- [ ] **Step 2: Open the PR against `dev`**

```bash
gh pr create --base dev --head feat/reaction-role-panels \
  --title "feat: reaction-role panels dashboard UI" \
  --body "$(cat <<'EOF'
## Summary
- Adds a full dashboard UI for xvm-api's reaction-role panels feature (bot side already live via xvm-bot #13/#14/#15). No UI existed for this at all before.
- Panel CRUD, option management, thumbnail-free v1 (thumbnail upload route exists but no UI trigger yet - card-level edit only), post-to-channel and apply-template with async toast+poll UX (both are 202 endpoints, bot does the work).
- Channel/role selection uses raw snowflake-ID text inputs, not a picker - the picker (item #3 of the wider dashboard/bot alignment survey) isn't built yet and its owner is undecided. The API takes raw IDs either way, so this is a pure UI upgrade later, no contract change.
- Template CRUD (admin-only) is out of scope - this only reads the template catalog for the Apply-Template picker.
- Fixed a latent bug in `xvmFetch`: it only handled `204` as a no-body response, `202` endpoints (new in this PR) would have thrown on `res.json()` against an empty body.

## Design doc
`docs/superpowers/specs/2026-09-22-reaction-role-panels-design.md`

## Verification
- `tsc --noEmit`: clean
- `vitest run`: full suite passing, including new `xvm-api.test.ts` cases for every new client function and the 202-handling fix
- Live click-through against local dev server: create/edit/delete panel, add/remove option, post-to-channel, apply-template, STAFF-role permission gating, non-connected-venue state, malformed-snowflake client-side rejection

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user.**
