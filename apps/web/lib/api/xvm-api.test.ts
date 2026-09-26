import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  listEvents,
  getEvent,
  type EventRow,
  deleteRoom,
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
  getService,
  createService,
  updateService,
  deleteService,
  grantServicePosition,
  revokeServicePosition,
  linkServiceInventory,
  unlinkServiceInventory,
  setStock,
  createStockMovement,
  listStockMovements,
  listFinanceTransactions,
  createFinanceTransaction,
  updateFinanceTransaction,
  voidFinanceTransaction,
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
  getFinanceSummary,
  listShiftsOnNow,
  type TaskRow,
  type PublicHours,
  type GiveawayRow,
  type RaffleRow,
  type ServiceCategoryRow,
  type ServiceRow,
  type StockMovementRow,
  type FinanceTransactionRow,
  type PanelRow,
  type TemplateRow,
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

describe("xvmFetch 202 handling", () => {
  it("does not throw on a 202 with an empty body", async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => {
        throw new Error("should not be called for a 202")
      },
      text: async () => "",
    } as unknown as Response)
    await expect(deleteRoom("token", "venue-1", 1)).resolves.toBeNull()
  })
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
    expect(JSON.parse(options.body)).toEqual({ linked_item_id: 42 })
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

  it("getService GETs /venues/{venueId}/services/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleService })
    const result = await getService("token", "venue-1", 1)
    expect(result).toEqual(sampleService)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1")
  })

  it("updateService PATCHes /venues/{venueId}/services/{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { ...sampleService, name: "Mocktail" } })
    const result = await updateService("token", "venue-1", 1, { name: "Mocktail" })
    expect(result).toEqual({ ...sampleService, name: "Mocktail" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1")
    expect(options.method).toBe("PATCH")
    expect(JSON.parse(options.body)).toEqual({ name: "Mocktail" })
  })

  it("unlinkServiceInventory DELETEs /{id}/inventory", async () => {
    mockFetchOnce({ ok: true, status: 204, body: null })
    await unlinkServiceInventory("token", "venue-1", 1)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/inventory")
    expect(options.method).toBe("DELETE")
  })

  it("setStock PUTs /{id}/inventory/stock", async () => {
    const sampleInventory = {
      service_id: 1,
      linked_item_id: 42,
      linked_item_name: "Vodka",
      linked_item_icon: 100,
      stock_count: 20,
      low_stock_threshold: 2,
      is_low: false,
      updated_at: "2026-01-01T00:00:00Z",
    }
    mockFetchOnce({ ok: true, status: 200, body: sampleInventory })
    const result = await setStock("token", "venue-1", 1, { stock_count: 20 })
    expect(result).toEqual(sampleInventory)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/inventory/stock")
    expect(options.method).toBe("PUT")
    expect(JSON.parse(options.body)).toEqual({ stock_count: 20 })
  })

  it("listStockMovements GETs /{id}/inventory/movements with default limit=50", async () => {
    const sampleMovement: StockMovementRow = {
      id: 1,
      reason: "sale",
      delta: -1,
      transaction_id: 9,
      actor_person_id: null,
      note: null,
      created_at: "2026-01-01T00:00:00Z",
    }
    mockFetchOnce({ ok: true, status: 200, body: [sampleMovement] })
    const result = await listStockMovements("token", "venue-1", 1)
    expect(result).toEqual([sampleMovement])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/services/1/inventory/movements")
    expect(url).toContain("limit=50")
  })
})

describe("Finance Transactions API", () => {
  const sampleTransaction: FinanceTransactionRow = {
    id: 1,
    kind: "sale",
    entry_type: "revenue",
    status: "posted",
    amount: 1000,
    category_id: null,
    event_id: null,
    service_id: 1,
    service_name: "Cocktail",
    membership_id: null,
    recorded_by_person_id: 3,
    customer_name: null,
    notes: null,
    idempotency_key: null,
    created_at: "2026-01-01T00:00:00Z",
    posted_at: "2026-01-01T00:00:00Z",
    posted_by_person_id: 3,
    voided_at: null,
    voided_by_person_id: null,
    void_reason: null,
  }

  it("listFinanceTransactions GETs with from/to/kind query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleTransaction] })
    const result = await listFinanceTransactions("token", "venue-1", {
      from: "2026-01-01",
      to: "2026-01-31",
      kind: "tip",
    })
    expect(result).toEqual([sampleTransaction])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions?")
    expect(url).toContain("from=2026-01-01")
    expect(url).toContain("to=2026-01-31")
    expect(url).toContain("kind=tip")
  })

  it("listFinanceTransactions omits kind when not passed", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleTransaction] })
    await listFinanceTransactions("token", "venue-1", { from: "2026-01-01", to: "2026-01-31" })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).not.toContain("kind")
  })

  it("createFinanceTransaction POSTs a sale transaction", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleTransaction })
    const result = await createFinanceTransaction("token", "venue-1", {
      kind: "sale",
      amount: 1000,
      service_id: 1,
    })
    expect(result).toEqual(sampleTransaction)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ kind: "sale", amount: 1000, service_id: 1 })
  })

  it("updateFinanceTransaction PATCHes /{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { ...sampleTransaction, notes: "comped" } })
    const result = await updateFinanceTransaction("token", "venue-1", 1, { notes: "comped" })
    expect(result).toEqual({ ...sampleTransaction, notes: "comped" })
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions/1")
    expect(options.method).toBe("PATCH")
    expect(JSON.parse(options.body)).toEqual({ notes: "comped" })
  })

  it("voidFinanceTransaction POSTs /{id}/void with a reason", async () => {
    const voided = { ...sampleTransaction, voided_at: "2026-01-02T00:00:00Z", voided_by_person_id: 3, void_reason: "refund" }
    mockFetchOnce({ ok: true, status: 200, body: voided })
    const result = await voidFinanceTransaction("token", "venue-1", 1, { reason: "refund" })
    expect(result).toEqual(voided)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions/1/void")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ reason: "refund" })
  })
})

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
    } as unknown as Response)
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
    } as unknown as Response)
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

describe("finance summary and on-now shifts", () => {
  it("getFinanceSummary GETs the summary for a window", async () => {
    const summary = {
      window_from: "2026-01-01T00:00:00Z",
      window_to: "2026-01-08T00:00:00Z",
      total_revenue: 5000,
      total_expense: 0,
      total_payout: 0,
      net: 5000,
      transaction_count: 2,
      category_totals: [],
    }
    mockFetchOnce({ ok: true, status: 200, body: summary })
    const result = await getFinanceSummary("token", "venue-1", {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-08T00:00:00.000Z",
    })
    expect(result).toEqual(summary)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/finance/transactions/summary?")
    expect(url).toContain("from=2026-01-01T00%3A00%3A00.000Z")
    expect(url).toContain("to=2026-01-08T00%3A00%3A00.000Z")
  })

  it("listShiftsOnNow GETs /shifts/now", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [] })
    const result = await listShiftsOnNow("token", "venue-1")
    expect(result).toEqual([])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toMatch(/\/venues\/venue-1\/shifts\/now$/)
  })
})

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
