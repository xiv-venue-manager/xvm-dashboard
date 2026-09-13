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
  listRaffles,
  createRaffle,
  updateRaffle,
  deleteRaffle,
  listRaffleEntries,
  creditTickets,
  refundTickets,
  rollRaffle,
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
  listServices,
  createService,
  deleteService,
  grantServicePosition,
  revokeServicePosition,
  linkServiceInventory,
  createStockMovement,
  type TaskRow,
  type PublicHours,
  type GiveawayRow,
  type RaffleRow,
  type ServiceCategoryRow,
  type ServiceRow,
  type StockMovementRow,
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

describe("Raffles API", () => {
  const sampleRaffle: RaffleRow = {
    id: 1,
    name: "Anniversary Draw",
    cost_per_ticket: 100_000,
    winner_basis_points: 5_000,
    num_winners: 1,
    auto_notify: true,
    entry_count: 0,
    ticket_count: 0,
    pot: 0,
    rolled_at: null,
    rolled_by_person_id: null,
    created_at: "2026-09-06T00:00:00Z",
  }

  it("listRaffles GETs the venue's raffles", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleRaffle] })
    const result = await listRaffles("token", "venue-1")
    expect(result).toEqual([sampleRaffle])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/raffles")
  })

  it("createRaffle POSTs to /venues/{venueId}/raffles", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleRaffle })
    const result = await createRaffle("token", "venue-1", { name: "Anniversary Draw" })
    expect(result).toEqual(sampleRaffle)
  })

  it("updateRaffle PATCHes /raffles/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleRaffle })
    const result = await updateRaffle("token", "venue-1", 1, { name: "Updated" })
    expect(result).toEqual(sampleRaffle)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1")
    expect(options.method).toBe("PATCH")
  })

  it("deleteRaffle DELETEs /raffles/{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteRaffle("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1")
    expect(options.method).toBe("DELETE")
  })

  it("listRaffleEntries GETs /raffles/{id}/entries", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    await listRaffleEntries("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries")
  })

  it("creditTickets PUTs /raffles/{id}/entries/{discordUserId}", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: { discord_user_id: "555", quantity: 3, entered_at: "2026-09-06T00:00:00Z", won_at: null, winner_rank: null },
    })
    await creditTickets("token", "venue-1", 1, "555", { quantity: 3 })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries/555")
    expect(options.method).toBe("PUT")
    expect(JSON.parse(options.body)).toEqual({ quantity: 3 })
  })

  it("refundTickets DELETEs /raffles/{id}/entries/{discordUserId}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await refundTickets("token", "venue-1", 1, "555")
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/entries/555")
    expect(options.method).toBe("DELETE")
  })

  it("rollRaffle POSTs /raffles/{id}/roll", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: { winners: [{ discord_user_id: "555", winner_rank: 1 }], ticket_count: 10, pot: 1_000_000, winners_take: 500_000, venue_take: 500_000 },
    })
    const result = await rollRaffle("token", "venue-1", 1)
    expect(result.pot).toBe(1_000_000)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/raffles/1/roll")
    expect(options.method).toBe("POST")
  })
})

describe("Service categories API", () => {
  const sampleCategory: ServiceCategoryRow = { id: 1, name: "Drinks", sort_order: 0 }

  it("listServiceCategories GETs /venues/{venueId}/services/categories", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleCategory] })
    const result = await listServiceCategories("token", "venue-1")
    expect(result).toEqual([sampleCategory])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/categories")
  })

  it("createServiceCategory POSTs to /venues/{venueId}/services/categories", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleCategory })
    const result = await createServiceCategory("token", "venue-1", { name: "Drinks", sort_order: 0 })
    expect(result).toEqual(sampleCategory)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/categories")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ name: "Drinks", sort_order: 0 })
  })

  it("updateServiceCategory PATCHes /{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleCategory })
    const result = await updateServiceCategory("token", "venue-1", 1, { name: "Food & Drink" })
    expect(result).toEqual(sampleCategory)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/categories/1")
    expect(options.method).toBe("PATCH")
    expect(JSON.parse(options.body)).toEqual({ name: "Food & Drink" })
  })

  it("deleteServiceCategory DELETEs /{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteServiceCategory("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/categories/1")
    expect(options.method).toBe("DELETE")
  })
})

describe("Services API", () => {
  const sampleService: ServiceRow = {
    id: 1,
    name: "Cocktail",
    description: null,
    price_minor: 1000,
    category_id: 1,
    is_active: true,
    sort_order: 0,
    position_ids: [],
    inventory: null,
  }

  it("listServices GETs /venues/{venueId}/services", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleService] })
    const result = await listServices("token", "venue-1")
    expect(result).toEqual([sampleService])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services")
  })

  it("createService POSTs to /venues/{venueId}/services", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleService })
    const result = await createService("token", "venue-1", { name: "Cocktail", price_minor: 1000 })
    expect(result).toEqual(sampleService)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ name: "Cocktail", price_minor: 1000 })
  })

  it("deleteService DELETEs /{id}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await deleteService("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1")
    expect(options.method).toBe("DELETE")
  })

  it("grantServicePosition POSTs to /{id}/positions", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { ...sampleService, position_ids: [5] } })
    const result = await grantServicePosition("token", "venue-1", 1, 5)
    expect(result).toEqual({ ...sampleService, position_ids: [5] })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/positions")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ position_id: 5 })
  })

  it("revokeServicePosition DELETEs /{id}/positions/{positionId}", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await revokeServicePosition("token", "venue-1", 1, 5)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/positions/5")
    expect(options.method).toBe("DELETE")
  })

  it("linkServiceInventory PUTs /{id}/inventory", async () => {
    const sampleInventory = {
      service_id: 1,
      linked_item_id: 42,
      linked_item_name: "Vodka",
      linked_item_icon: 100,
      stock_count: 10,
      low_stock_threshold: 2,
      is_low: false,
      updated_at: "2026-01-01T00:00:00Z",
    }
    mockFetchOnce({ ok: true, status: 200, body: sampleInventory })
    const result = await linkServiceInventory("token", "venue-1", 1, { linked_item_id: 42 })
    expect(result).toEqual(sampleInventory)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/inventory")
    expect(options.method).toBe("PUT")
  })

  it("createStockMovement POSTs to /{id}/inventory/movements", async () => {
    const sampleMovement: StockMovementRow = {
      id: 1,
      reason: "restock",
      delta: 10,
      transaction_id: null,
      actor_person_id: 3,
      note: null,
      created_at: "2026-01-01T00:00:00Z",
    }
    mockFetchOnce({ ok: true, status: 201, body: sampleMovement })
    const result = await createStockMovement("token", "venue-1", 1, { reason: "restock", delta: 10 })
    expect(result).toEqual(sampleMovement)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/inventory/movements")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ reason: "restock", delta: 10 })
  })
})
