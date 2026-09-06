import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  listTasks,
  createTask,
  updateTask,
  assignTask,
  startTask,
  completeTask,
  cancelTask,
  getPublicHoursBatch,
  getPublicHoursForVenues,
  PUBLIC_HOURS_BATCH_MAX,
  listGiveaways,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  listGiveawayEntries,
  rollGiveaway,
  type TaskRow,
  type PublicHours,
  type GiveawayRow,
} from "./xvm-api"

function mockFetchOnce({ ok, status, body }: { ok: boolean; status: number; body: unknown }) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response)
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

describe("Tasks API", () => {
  const sampleTask: TaskRow = {
    id: 1,
    title: "Restock bar",
    description: null,
    priority: 2,
    due_at: null,
    category_id: null,
    assigned_membership_id: null,
    assigned_position_id: null,
    started_at: null,
    completed_at: null,
    completed_by_person_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_by_person_id: 1,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  }

  it("listTasks GETs the venue's tasks with query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleTask] })
    const result = await listTasks("token", "venue-1", { includeCancelled: true })
    expect(result).toEqual([sampleTask])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("include_cancelled=true")
  })

  it("createTask POSTs to /venues/{venueId}/tasks", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleTask })
    const result = await createTask("token", "venue-1", { title: "Restock bar", priority: 2 })
    expect(result).toEqual(sampleTask)
  })

  it("updateTask PATCHes /{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    const result = await updateTask("token", "venue-1", 1, { title: "Restock bar urgently" })
    expect(result).toEqual(sampleTask)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/tasks/1")
    expect(options.method).toBe("PATCH")
  })

  it("assignTask POSTs to /{id}/assign", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await assignTask("token", "venue-1", 1, { position_id: 5 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/assign")
  })

  it("startTask POSTs to /{id}/start", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await startTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/start")
  })

  it("completeTask POSTs to /{id}/complete", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await completeTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/complete")
  })

  it("cancelTask POSTs to /{id}/cancel with an optional reason", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await cancelTask("token", "venue-1", 1, "No longer needed")
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/cancel")
    expect(JSON.parse(options.body)).toEqual({ reason: "No longer needed" })
  })
})

describe("Public hours batch", () => {
  function publicHours(open: boolean): PublicHours {
    return { open_now: { open, current: null, next: null }, rules: [], upcoming: [] }
  }

  it("getPublicHoursBatch GETs /public/venues/hours with comma-separated ids", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { venues: { vn_a: publicHours(true), vn_b: publicHours(false) } } })
    const result = await getPublicHoursBatch(["vn_a", "vn_b"])
    expect(result.venues.vn_a.open_now.open).toBe(true)
    expect(result.venues.vn_b.open_now.open).toBe(false)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(decodeURIComponent(url)).toContain("/public/venues/hours?ids=vn_a,vn_b")
  })

  it("getPublicHoursBatch returns an empty map without fetching for zero ids", async () => {
    const result = await getPublicHoursBatch([])
    expect(result).toEqual({ venues: {} })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("getPublicHoursBatch forwards the days window when provided", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { venues: {} } })
    await getPublicHoursBatch(["vn_a"], 7)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(decodeURIComponent(url)).toContain("ids=vn_a")
    expect(decodeURIComponent(url)).toContain("days=7")
  })

  it("getPublicHoursForVenues issues one request per 50-id chunk and merges the maps", async () => {
    const ids = Array.from({ length: PUBLIC_HOURS_BATCH_MAX * 2 + 3 }, (_, i) => `vn_${i}`)
    for (let chunk = 0; chunk < 3; chunk++) {
      const venues: Record<string, PublicHours> = {}
      for (let i = chunk * PUBLIC_HOURS_BATCH_MAX; i < Math.min((chunk + 1) * PUBLIC_HOURS_BATCH_MAX, ids.length); i++) {
        venues[`vn_${i}`] = publicHours(i % 2 === 0)
      }
      mockFetchOnce({ ok: true, status: 200, body: { venues } })
    }

    const result = await getPublicHoursForVenues(ids)

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(3)
    const chunkSizes = calls.map(([url]) => decodeURIComponent(String(url)).split("ids=")[1].split("&")[0].split(",").length)
    expect(chunkSizes).toEqual([PUBLIC_HOURS_BATCH_MAX, PUBLIC_HOURS_BATCH_MAX, 3])

    expect(Object.keys(result)).toHaveLength(ids.length)
    expect(result.vn_0).toEqual(publicHours(true))
    expect(result.vn_1).toEqual(publicHours(false))
    expect(result[`vn_${ids.length - 1}`]).toEqual(publicHours((ids.length - 1) % 2 === 0))
  })
})

describe("Giveaways API", () => {
  const sampleGiveaway: GiveawayRow = {
    id: 1,
    name: "Weekend VIP Pass",
    description: null,
    prize: "1x VIP Pass",
    thumbnail_url: null,
    color: null,
    emoji: null,
    end_at: null,
    num_winners: 1,
    auto_notify: true,
    entry_count: 0,
    rolled_at: null,
    rolled_by_person_id: null,
    created_at: "2026-09-06T00:00:00Z",
  }

  it("listGiveaways GETs the venue's giveaways", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleGiveaway] })
    const result = await listGiveaways("token", "venue-1")
    expect(result).toEqual([sampleGiveaway])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/giveaways")
  })

  it("listGiveaways forwards includeRolled and limit as query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listGiveaways("token", "venue-1", { includeRolled: true, limit: 10 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("include_rolled=true")
    expect(url).toContain("limit=10")
  })

  it("createGiveaway POSTs to /venues/{venueId}/giveaways", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleGiveaway })
    const result = await createGiveaway("token", "venue-1", { name: "Weekend VIP Pass", prize: "1x VIP Pass" })
    expect(result).toEqual(sampleGiveaway)
  })

  it("updateGiveaway PATCHes /giveaways/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleGiveaway })
    const result = await updateGiveaway("token", "venue-1", 1, { name: "Updated" })
    expect(result).toEqual(sampleGiveaway)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1")
    expect(options.method).toBe("PATCH")
  })

  it("deleteGiveaway DELETEs /giveaways/{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteGiveaway("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1")
    expect(options.method).toBe("DELETE")
  })

  it("listGiveawayEntries GETs /giveaways/{id}/entries", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listGiveawayEntries("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1/entries")
  })

  it("rollGiveaway POSTs /giveaways/{id}/roll", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { winners: [{ discord_user_id: "123", winner_rank: 1 }] } })
    const result = await rollGiveaway("token", "venue-1", 1)
    expect(result.winners).toHaveLength(1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/giveaways/1/roll")
    expect(options.method).toBe("POST")
  })
})
