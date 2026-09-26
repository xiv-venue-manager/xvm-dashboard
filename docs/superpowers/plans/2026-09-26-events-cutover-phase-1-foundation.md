# Events cutover, phase 1: foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the xvm-api events client and a status-derivation helper, so later phases can move the Events feature off Prisma without touching either again.

**Architecture:**
- Two additions only: an "Events API" section in `lib/api/xvm-api.ts` (types plus ten functions that mirror the API's events router) and a new `lib/api/event-status.ts` that derives the dashboard's five statuses from xvm-api's timestamps.
- **No behaviour change.** No route, page, cron or schema is touched, and nothing calls the new code yet. The phase is safe to merge on its own and gives phases 2 to 5 a tested base.
- The status helper is a standalone type, not Prisma's `EventStatus`, because the point of the cutover is to stop depending on Prisma.

**Tech Stack:** Next.js App Router, TypeScript strict, vitest.

**Worktree:** create a fresh one off `origin/dev` (for example `~/xvm-dashboard-events-p1`, branch `feat/events-phase-1-foundation`). Paths are relative to `apps/web/`. Run commands from `apps/web/`.

**Conventions:** no code comments (rationale goes in commit messages); match surrounding style; TS strict. Add the commit trailer lines from the session's attribution instructions to every commit.

---

## Where this sits

This is phase 1 of the Events cutover scoped on 2026-09-26. The order is:

1. **Foundation (this plan):** status helper, API client, tests.
2. **Core routes and pages:** events CRUD, cancel-series, events list, detail, edit and new pages.
3. **Consumers:** overview, live, shifts, patron logs, timeline, analytics, public stats, venue status, and the plugin-facing `events/active` route and visit attribution.
4. **Crons:** retire status persistence and the recurrence roll-forward, replace the completion metrics.
5. **The bridge:** int event ids on dependents, and sales passing `event_id` again (closing the gap recorded in `lib/api/transactions.ts`).
6. **Blocked:** Partake sync and the Discord mirror fields (xvm-api #20 and the on-hold webhook retirement).

## Facts this plan relies on (checked 2026-09-26 against xvm-api `origin/dev`)

- **Routes**, all under `/venues/{venue_id}/events`:
  - `GET ""` with `from`, `to` (ISO datetimes, at most 60 days apart) and `include_cancelled`, returning `EventItem[]`
  - `POST ""` returning `EventRow` (201)
  - `POST /series` returning `{ rule: RuleRow, seed: EventRow }` (201)
  - `POST /materialize` with `{ recurrence_rule_id, scheduled_at }` returning `EventRow`
  - `POST /series/{rule_id}/end` with `{ cancel_future, reason }` returning `{ cancelled: number }`
  - `GET /{event_id}`, `PATCH /{event_id}`, `POST /{event_id}/publish`, `POST /{event_id}/cancel` with `{ reason }`, and `DELETE /{event_id}` (204)
  - Templates already live at `/events/templates` and are already in the client.
- **`EventRow`** has `id: int`, `title`, `description`, `event_type`, `location`, `image_url`, `starts_at`, `ends_at`, `scheduled_at`, `published_at`, `cancelled_at`, `cancel_reason`, `recurrence_rule_id`, `partake_event_id`, `created_by_person_id`, `created_at`, `updated_at`. There is no persisted status, timezone, attendance or revenue.
- **`EventItem`** (the list's item) adds `materialized: bool` and lets `id` be null for virtual, not-yet-created occurrences. It has the same four status fields as `EventRow`.
- **The API's live rule** (`PatronLogService._live_event_id`): published, not cancelled, `starts_at <= now <= ends_at`, newest start first. The helper follows it, which differs from the old cron by one instant: an event whose `ends_at` equals `now` is `ACTIVE` here and was `COMPLETED` there. Nothing depends on that instant.
- **`event_type`** is an opaque string on the API. The dashboard's uppercase names (`PERFORMANCE` and so on) pass through unchanged, exactly as templates already do.
- **`RuleRow`** already exists in `xvm-api.ts` and matches the API's series rule.

## File Structure

- Modify `lib/api/xvm-api.ts`: add the "Events API" section after `deleteEventTemplate` (line 1552 on `88e4f4d5`).
- Modify `lib/api/xvm-api.test.ts`: client tests.
- Create `lib/api/event-status.ts`: `EventStatus`, `deriveEventStatus`.
- Create `lib/api/event-status.test.ts`: boundary tests.

Not touched: any route, page, cron, the Prisma schema, or `lib/api/event-template-shape.ts`.

---

### Task 1: Event types and the read functions

**Files:**
- Modify: `lib/api/xvm-api.ts`
- Test: `lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/api/xvm-api.test.ts`, add these names to the import list from `"./xvm-api"`: `listEvents`, `getEvent`, `type EventRow`. Then append:

```ts
describe("Events API reads", () => {
  const eventRow: EventRow = {
    id: 7,
    title: "Karaoke Night",
    description: null,
    event_type: "PERFORMANCE",
    location: null,
    image_url: null,
    starts_at: "2026-10-03T19:00:00Z",
    ends_at: "2026-10-03T22:00:00Z",
    scheduled_at: null,
    published_at: "2026-09-30T12:00:00Z",
    cancelled_at: null,
    cancel_reason: null,
    recurrence_rule_id: null,
    partake_event_id: null,
    created_by_person_id: 3,
    created_at: "2026-09-30T11:00:00Z",
    updated_at: "2026-09-30T12:00:00Z",
  }

  it("listEvents GETs the window and can include cancelled events", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listEvents("token", "venue-1", {
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-08T00:00:00Z",
      includeCancelled: true,
    })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/events?")
    expect(url).toContain("from=2026-10-01T00%3A00%3A00Z")
    expect(url).toContain("to=2026-10-08T00%3A00%3A00Z")
    expect(url).toContain("include_cancelled=true")
  })

  it("listEvents leaves include_cancelled off by default", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listEvents("token", "venue-1", { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).not.toContain("include_cancelled")
  })

  it("getEvent GETs /events/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: eventRow })
    const result = await getEvent("token", "venue-1", 7)
    expect(result).toEqual(eventRow)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toMatch(/\/venues\/venue-1\/events\/7$/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/api/xvm-api.test.ts -t "Events API reads"`
Expected: FAIL, the new imports do not exist yet.

- [ ] **Step 3: Implement**

Insert this after `deleteEventTemplate` in `lib/api/xvm-api.ts`:

```ts
// ── Events API ────────────────────────────────────────────────────

export interface EventRow {
  id: number
  title: string
  description: string | null
  event_type: string | null
  location: string | null
  image_url: string | null
  starts_at: string
  ends_at: string
  scheduled_at: string | null
  published_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  recurrence_rule_id: number | null
  partake_event_id: number | null
  created_by_person_id: number | null
  created_at: string
  updated_at: string
}

export interface EventItem {
  materialized: boolean
  id: number | null
  recurrence_rule_id: number | null
  scheduled_at: string | null
  title: string
  description: string | null
  event_type: string | null
  location: string | null
  image_url: string | null
  starts_at: string
  ends_at: string
  published_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

export async function listEvents(
  personToken: string,
  venueId: string,
  opts: { from: string; to: string; includeCancelled?: boolean }
): Promise<EventItem[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from: opts.from, to: opts.to })
  if (opts.includeCancelled) params.set("include_cancelled", "true")
  return xvmFetch<EventItem[]>(`/venues/${venueId}/events?${params}`, {}, personToken)
}

export async function getEvent(personToken: string, venueId: string, eventId: number): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(`/venues/${venueId}/events/${eventId}`, {}, personToken)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/api/xvm-api.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: xvm-api client types and reads for events"
```

---

### Task 2: The write functions

**Files:**
- Modify: `lib/api/xvm-api.ts`
- Test: `lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these names to the import list from `"./xvm-api"`: `createEvent`, `createEventSeries`, `materializeEvent`, `endEventSeries`, `updateEvent`, `publishEvent`, `cancelEvent`, `deleteEvent`. Then append after the reads block:

```ts
describe("Events API writes", () => {
  const eventRow: EventRow = {
    id: 7,
    title: "Karaoke Night",
    description: null,
    event_type: "PERFORMANCE",
    location: null,
    image_url: null,
    starts_at: "2026-10-03T19:00:00Z",
    ends_at: "2026-10-03T22:00:00Z",
    scheduled_at: null,
    published_at: null,
    cancelled_at: null,
    cancel_reason: null,
    recurrence_rule_id: null,
    partake_event_id: null,
    created_by_person_id: 3,
    created_at: "2026-09-30T11:00:00Z",
    updated_at: "2026-09-30T11:00:00Z",
  }

  const lastCall = () => (fetch as ReturnType<typeof vi.fn>).mock.calls[0]

  it("createEvent POSTs the event", async () => {
    mockFetchOnce({ ok: true, status: 201, body: eventRow })
    const result = await createEvent("token", "venue-1", {
      title: "Karaoke Night",
      event_type: "PERFORMANCE",
      starts_at: "2026-10-03T19:00:00Z",
      ends_at: "2026-10-03T22:00:00Z",
      publish: true,
    })
    expect(result).toEqual(eventRow)
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events$/)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({
      title: "Karaoke Night",
      event_type: "PERFORMANCE",
      starts_at: "2026-10-03T19:00:00Z",
      ends_at: "2026-10-03T22:00:00Z",
      publish: true,
    })
  })

  it("createEventSeries POSTs to /events/series and returns the rule and seed", async () => {
    const rule = {
      interval: "weekly",
      weekday: 4,
      day_of_month: null,
      week_of_month: null,
      start_minute_of_day: 1140,
      duration_minutes: 180,
      timezone: "UTC",
      anchor_date: "2026-10-02",
      ends_on: null,
      ends_after_count: null,
      enabled: true,
    }
    mockFetchOnce({ ok: true, status: 201, body: { rule, seed: eventRow } })
    const result = await createEventSeries("token", "venue-1", {
      title: "Karaoke Night",
      interval: "weekly",
      weekday: 4,
      start_minute_of_day: 1140,
      duration_minutes: 180,
      anchor_date: "2026-10-02",
    })
    expect(result.rule.interval).toBe("weekly")
    expect(result.seed.id).toBe(7)
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/series$/)
    expect(init.method).toBe("POST")
  })

  it("materializeEvent POSTs the rule and scheduled time", async () => {
    mockFetchOnce({ ok: true, status: 200, body: eventRow })
    await materializeEvent("token", "venue-1", { recurrence_rule_id: 5, scheduled_at: "2026-10-09T19:00:00Z" })
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/materialize$/)
    expect(JSON.parse(init.body)).toEqual({ recurrence_rule_id: 5, scheduled_at: "2026-10-09T19:00:00Z" })
  })

  it("endEventSeries POSTs to /series/{rule}/end and returns the cancelled count", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { cancelled: 3 } })
    const result = await endEventSeries("token", "venue-1", 5, { cancel_future: true, reason: "Moving venue" })
    expect(result).toEqual({ cancelled: 3 })
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/series\/5\/end$/)
    expect(JSON.parse(init.body)).toEqual({ cancel_future: true, reason: "Moving venue" })
  })

  it("updateEvent PATCHes only the given fields", async () => {
    mockFetchOnce({ ok: true, status: 200, body: eventRow })
    await updateEvent("token", "venue-1", 7, { title: "Karaoke Night 2" })
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/7$/)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ title: "Karaoke Night 2" })
  })

  it("publishEvent POSTs to /publish with no body", async () => {
    mockFetchOnce({ ok: true, status: 200, body: eventRow })
    await publishEvent("token", "venue-1", 7)
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/7\/publish$/)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
  })

  it("cancelEvent POSTs the reason", async () => {
    mockFetchOnce({ ok: true, status: 200, body: eventRow })
    await cancelEvent("token", "venue-1", 7, { reason: "Host unwell" })
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/7\/cancel$/)
    expect(JSON.parse(init.body)).toEqual({ reason: "Host unwell" })
  })

  it("deleteEvent DELETEs and returns nothing", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" } as unknown as Response)
    await expect(deleteEvent("token", "venue-1", 7)).resolves.toBeNull()
    const [url, init] = lastCall()
    expect(url).toMatch(/\/venues\/venue-1\/events\/7$/)
    expect(init.method).toBe("DELETE")
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/api/xvm-api.test.ts -t "Events API writes"`
Expected: FAIL, the new imports do not exist yet.

- [ ] **Step 3: Implement**

Append to the Events API section in `lib/api/xvm-api.ts`, after `getEvent`:

```ts
export interface EventCreateData {
  title: string
  description?: string | null
  event_type?: string | null
  location?: string | null
  publish?: boolean
  starts_at: string
  ends_at: string
}

export interface EventSeriesCreateData {
  title: string
  description?: string | null
  event_type?: string | null
  location?: string | null
  publish?: boolean
  interval: string
  weekday?: number | null
  day_of_month?: number | null
  week_of_month?: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone?: string | null
  anchor_date: string
  ends_on?: string | null
  ends_after_count?: number | null
}

export interface EventSeriesRow {
  rule: RuleRow
  seed: EventRow
}

export interface EventUpdateData {
  title?: string
  description?: string | null
  event_type?: string | null
  location?: string | null
  starts_at?: string
  ends_at?: string
}

export interface EventSeriesEndData {
  cancel_future?: boolean
  reason?: string | null
}

export interface EventSeriesEnded {
  cancelled: number
}

export async function createEvent(personToken: string, venueId: string, data: EventCreateData): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(`/venues/${venueId}/events`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function createEventSeries(
  personToken: string,
  venueId: string,
  data: EventSeriesCreateData
): Promise<EventSeriesRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventSeriesRow>(
    `/venues/${venueId}/events/series`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function materializeEvent(
  personToken: string,
  venueId: string,
  data: { recurrence_rule_id: number; scheduled_at: string }
): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(
    `/venues/${venueId}/events/materialize`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function endEventSeries(
  personToken: string,
  venueId: string,
  ruleId: number,
  data: EventSeriesEndData
): Promise<EventSeriesEnded> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventSeriesEnded>(
    `/venues/${venueId}/events/series/${ruleId}/end`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updateEvent(
  personToken: string,
  venueId: string,
  eventId: number,
  data: EventUpdateData
): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(
    `/venues/${venueId}/events/${eventId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function publishEvent(personToken: string, venueId: string, eventId: number): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(`/venues/${venueId}/events/${eventId}/publish`, { method: "POST" }, personToken)
}

export async function cancelEvent(
  personToken: string,
  venueId: string,
  eventId: number,
  data: { reason?: string | null }
): Promise<EventRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<EventRow>(
    `/venues/${venueId}/events/${eventId}/cancel`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteEvent(personToken: string, venueId: string, eventId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/events/${eventId}`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/api/xvm-api.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: xvm-api client writes for events (create, series, materialize, update, publish, cancel, delete)"
```

---

### Task 3: The status helper

**Files:**
- Create: `lib/api/event-status.ts`
- Test: `lib/api/event-status.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/api/event-status.test.ts`:

```ts
import { describe, it, expect } from "vitest"

import { deriveEventStatus, type EventStatusInput } from "./event-status"

const STARTS = "2026-10-03T19:00:00Z"
const ENDS = "2026-10-03T22:00:00Z"

const published: EventStatusInput = { starts_at: STARTS, ends_at: ENDS, published_at: "2026-09-30T12:00:00Z", cancelled_at: null }
const draft: EventStatusInput = { ...published, published_at: null }
const cancelled: EventStatusInput = { ...published, cancelled_at: "2026-10-01T09:00:00Z" }

const at = (iso: string) => new Date(iso)

describe("deriveEventStatus", () => {
  it("is DRAFT when unpublished, even after the event has passed", () => {
    expect(deriveEventStatus(draft, at("2026-10-01T00:00:00Z"))).toBe("DRAFT")
    expect(deriveEventStatus(draft, at("2026-10-05T00:00:00Z"))).toBe("DRAFT")
  })

  it("is PUBLISHED before the start", () => {
    expect(deriveEventStatus(published, at("2026-10-03T18:59:59.999Z"))).toBe("PUBLISHED")
  })

  it("is ACTIVE from the start instant", () => {
    expect(deriveEventStatus(published, at(STARTS))).toBe("ACTIVE")
  })

  it("is ACTIVE mid-event", () => {
    expect(deriveEventStatus(published, at("2026-10-03T20:30:00Z"))).toBe("ACTIVE")
  })

  it("is still ACTIVE at the end instant, matching the API's live rule", () => {
    expect(deriveEventStatus(published, at(ENDS))).toBe("ACTIVE")
  })

  it("is COMPLETED just after the end", () => {
    expect(deriveEventStatus(published, at("2026-10-03T22:00:00.001Z"))).toBe("COMPLETED")
  })

  it("is CANCELLED whatever the time", () => {
    expect(deriveEventStatus(cancelled, at("2026-10-02T00:00:00Z"))).toBe("CANCELLED")
    expect(deriveEventStatus(cancelled, at("2026-10-03T20:00:00Z"))).toBe("CANCELLED")
    expect(deriveEventStatus(cancelled, at("2026-10-05T00:00:00Z"))).toBe("CANCELLED")
  })

  it("is CANCELLED for a cancelled draft", () => {
    expect(deriveEventStatus({ ...draft, cancelled_at: "2026-10-01T09:00:00Z" }, at("2026-10-02T00:00:00Z"))).toBe("CANCELLED")
  })

  it("accepts a list item as well as a full row", () => {
    const item = { ...published, materialized: false, id: null }
    expect(deriveEventStatus(item, at("2026-10-03T20:00:00Z"))).toBe("ACTIVE")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/api/event-status.test.ts`
Expected: FAIL, the module does not exist yet.

- [ ] **Step 3: Implement**

`lib/api/event-status.ts`:

```ts
export type EventStatus = "DRAFT" | "PUBLISHED" | "ACTIVE" | "COMPLETED" | "CANCELLED"

export interface EventStatusInput {
  starts_at: string
  ends_at: string
  published_at: string | null
  cancelled_at: string | null
}

export function deriveEventStatus(event: EventStatusInput, now: Date = new Date()): EventStatus {
  if (event.cancelled_at) return "CANCELLED"
  if (!event.published_at) return "DRAFT"
  const at = now.getTime()
  if (at < new Date(event.starts_at).getTime()) return "PUBLISHED"
  if (at <= new Date(event.ends_at).getTime()) return "ACTIVE"
  return "COMPLETED"
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/api/event-status.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/api/event-status.ts lib/api/event-status.test.ts
git commit -m "feat: derive an event's status from xvm-api timestamps"
```

---

### Task 4: Contract check against a real xvm-api

The unit tests prove the client matches this plan's reading of the API. This task proves it matches the real API. It uses a scratch script that is **not committed**, and it needs nothing on the server.

**Files:** none in the repo. The script lives in your scratchpad directory.

- [ ] **Step 1: Start a local xvm-api on a throwaway SQLite database**

From `~/xvm-api-local` (or a clone of xvm-api on `dev`), with a scratch database path:

```bash
export APIV2_DATABASE_URL="sqlite+aiosqlite:///$SCRATCH/events-contract.db"
uv run alembic upgrade head
uv run python -m api.scripts.issue_credential --kind service --client dashboard --name "events contract check"
```

Copy the printed secret (shown once). Then start the API: `uv run python -m api &` (serves on `127.0.0.1:8000`). Confirm with `curl -s http://127.0.0.1:8000/health` (expect `{"status":"ok"}`).

- [ ] **Step 2: Write the scratch script**

`$SCRATCH/events-contract.ts`. Run it from `apps/web/` so the `@/` alias resolves:

```ts
import {
  exchangeToken, createVenue, createEvent, getEvent, listEvents, updateEvent, publishEvent,
  cancelEvent, deleteEvent, createEventSeries, materializeEvent, endEventSeries,
} from "@/lib/api/xvm-api"
import { deriveEventStatus } from "@/lib/api/event-status"

const results: string[] = []
const check = (label: string, ok: boolean, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`)
}
const hour = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

async function main() {
  const now = Date.now()
  const { secret: token } = await exchangeToken("100000000000000001", "Contract Check")
  const venue = await createVenue(token, { name: "Contract Venue", data_center: "Aether", world: "Cactuar" })
  const v = venue.id

  const live = await createEvent(token, v, {
    title: "Live now", event_type: "PERFORMANCE", publish: true,
    starts_at: iso(now - hour), ends_at: iso(now + hour),
  })
  check("createEvent returns an int id", Number.isInteger(live.id))
  check("live event derives ACTIVE", deriveEventStatus(live) === "ACTIVE", live.published_at ?? "not published")

  const fetched = await getEvent(token, v, live.id)
  check("getEvent round-trips the title", fetched.title === "Live now")

  const draft = await createEvent(token, v, {
    title: "Later draft", starts_at: iso(now + 24 * hour), ends_at: iso(now + 27 * hour),
  })
  check("unpublished event derives DRAFT", deriveEventStatus(draft) === "DRAFT")
  const published = await publishEvent(token, v, draft.id)
  check("publishEvent makes it PUBLISHED", deriveEventStatus(published) === "PUBLISHED")

  const updated = await updateEvent(token, v, draft.id, { title: "Later, renamed" })
  check("updateEvent changes only the title", updated.title === "Later, renamed" && updated.starts_at === published.starts_at)

  const window = { from: iso(now - 2 * hour), to: iso(now + 48 * hour) }
  const items = await listEvents(token, v, window)
  check("listEvents returns both real events", items.filter((i) => i.materialized).length >= 2, `${items.length} items`)

  const cancelled = await cancelEvent(token, v, draft.id, { reason: "contract check" })
  check("cancelEvent derives CANCELLED", deriveEventStatus(cancelled) === "CANCELLED", cancelled.cancel_reason ?? "")
  const hidden = await listEvents(token, v, window)
  const shown = await listEvents(token, v, { ...window, includeCancelled: true })
  check("cancelled event is hidden unless includeCancelled", shown.length === hidden.length + 1, `${hidden.length} vs ${shown.length}`)

  const series = await createEventSeries(token, v, {
    title: "Weekly night", interval: "weekly", weekday: 4, publish: true,
    start_minute_of_day: 19 * 60, duration_minutes: 180, anchor_date: iso(now).slice(0, 10),
  })
  const ruleId = series.seed.recurrence_rule_id
  check("createEventSeries returns a rule and a seed carrying the rule id", series.rule.interval === "weekly" && ruleId !== null)
  const future = await listEvents(token, v, { from: iso(now), to: iso(now + 30 * 24 * hour) })
  const virtual = future.find((i) => !i.materialized && i.recurrence_rule_id !== null)
  check("the list carries virtual occurrences with no id", virtual !== undefined && virtual.id === null)
  if (virtual && virtual.scheduled_at && virtual.recurrence_rule_id !== null) {
    const made = await materializeEvent(token, v, { recurrence_rule_id: virtual.recurrence_rule_id, scheduled_at: virtual.scheduled_at })
    check("materializeEvent mints a real row", Number.isInteger(made.id))
  }
  if (ruleId !== null) {
    const ended = await endEventSeries(token, v, ruleId, { cancel_future: true })
    check("endEventSeries reports a cancelled count", typeof ended.cancelled === "number", `${ended.cancelled}`)
  }

  await deleteEvent(token, v, live.id)
  let gone = false
  try { await getEvent(token, v, live.id) } catch { gone = true }
  check("deleteEvent removes the event", gone)
}

main().then(() => { console.log(results.join("\n")); process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0) })
  .catch((err) => { console.log(results.join("\n")); console.error("ERROR", err); process.exit(2) })
```

- [ ] **Step 3: Run it**

Run from `apps/web/`:

```bash
XVM_API_BASE_URL=http://127.0.0.1:8000 XVM_API_DASHBOARD_SERVICE_TOKEN=<the secret from step 1> npx tsx $SCRATCH/events-contract.ts
```

Expected: every line `PASS`, exit code 0. **A `FAIL` or an ERROR means the client or helper does not match the real API.** Fix the client or the helper (never the check) and rerun. Likely causes: a field name, an optional field the API requires, or the response shape of `endEventSeries` or `createEventSeries`.

- [ ] **Step 4: Stop the API and remove the scratch files**

Stop the background `python -m api` process by its PID, and delete `$SCRATCH/events-contract.db` and `$SCRATCH/events-contract.ts`. Nothing from this task is committed.

---

### Task 5: Verify and open the PR

- [ ] **Step 1: Run the full checks**

Run: `npx tsc --noEmit && pnpm run lint && npx vitest run`
Expected: no type errors, 0 lint errors (existing warnings are fine), all tests pass. The test count rises by 20: 3 reads, 8 writes and 9 status tests.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/events-phase-1-foundation
gh pr create --base dev --head feat/events-phase-1-foundation --title "feat: xvm-api events client and status derivation (Events cutover phase 1)"
```

The description should say: nothing calls this code yet and no behaviour changes; it is the base for phases 2 to 5; the status helper follows the API's live rule, so an event whose end equals now is `ACTIVE` where the old cron marked it `COMPLETED`; and the contract check in Task 4 ran against a local xvm-api and passed. Follow the stop-slop pass before pushing.

---

## Not in this phase

- Any route, page, cron, plugin route or Prisma schema change (phases 2 to 5).
- A mapper from `EventRow` to the dashboard's existing event shape. It has no caller until phase 2, so it belongs there.
- A helper that chunks a range longer than 60 days into several list calls. Analytics and history views need it, so it belongs with phase 3.
- Person names for `created_by_person_id`. Phase 2 resolves them from the membership roster's `display_name`.

## Self-review

- **Spec coverage:** status helper (Task 3), client functions for every non-template route in the events router (Tasks 1 and 2), a real-API contract check (Task 4), verification and PR (Task 5).
- **Placeholders:** none. The only bracketed value is the service-credential secret in Task 4, which is minted at run time and cannot be written down.
- **Type consistency:** `EventRow`, `EventItem`, `EventCreateData`, `EventSeriesCreateData`, `EventSeriesRow`, `EventUpdateData`, `EventSeriesEndData`, `EventSeriesEnded` and the ten function names are used identically across Tasks 1, 2 and 4. `EventStatusInput` accepts both `EventRow` and `EventItem`, because they share the same four status fields.
