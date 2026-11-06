import { describe, it, expect } from "vitest"
import type { PeopleFile } from "./frogge-features"
import { mapFroggeTools, type FroggeToolsExport } from "./frogge-tools"

const NOW = "2026-11-04T00:00:00.000Z"
const G = "1111111111111111111"
const ctx = { venueKeyByGuild: { [G]: "venue-a" }, now: NOW }
const base = (): PeopleFile => ({ people: [], discordAccounts: [] })
const empty = (): FroggeToolsExport => ({
  forms: [],
  form_questions: [],
  form_responses: [],
  giveaways: [],
  giveaway_entries: [],
  raffles: [],
  raffle_entries: [],
  sticky_messages: [],
  tracked_streams: [],
  quote_board_settings: [],
  custom_embeds: [],
  custom_embed_fields: [],
  auto_reactor_rules: [],
  event_templates: [],
  message_templates: [],
  rooms: [],
})
const run = (over: Partial<FroggeToolsExport>) => mapFroggeTools({ ...empty(), ...over }, ctx, base())

const form = (id: number, name: string) => ({
  id,
  guild_id: G,
  name,
  description: null,
  pre_prompt: null,
  post_prompt: null,
  thumbnail_url: null,
  color: null,
  button_label: "Fill Out",
  button_emoji: null,
  allow_multiple_responses: false,
  message_id: null,
})
const question = { id: 32, guild_id: G, form_id: 1, prompt: "Name?", question_type: "short_text", required: true, sort_order: 0, options: [] }
const response = {
  id: 1,
  guild_id: G,
  form_id: 1,
  discord_user_id: "42",
  submitted_at: null,
  answers: [{ question_id: 32, question: "Name?", question_type: "short_text", answer: "Mira" }],
}

describe("forms", () => {
  it("points an answer at the question's key", () => {
    const r = run({ forms: [form(1, "Apply")], form_questions: [question], form_responses: [response] })
    expect(r.tools.formResponses[0].answers).toEqual([{ question_id: "frogge:fq:32", question: "Name?", question_type: "short_text", answer: "Mira" }])
  })

  it("drops a response whose question is gone", () => {
    const r = run({ forms: [form(1, "Apply")], form_responses: [response] })
    expect(r.tools.formResponses).toEqual([])
    expect(r.report.dropped[0].reason).toContain("question 32")
  })

  it("renames a form whose name is already taken at the venue, ignoring case", () => {
    const r = run({ forms: [form(1, "Apply"), form(2, "apply")] })
    expect(r.tools.forms.map((f) => f.name)).toEqual(["Apply", "apply 2"])
  })
})

describe("giveaways and raffles", () => {
  const giveaway = {
    id: 1,
    guild_id: G,
    created_by: "42",
    name: null,
    description: null,
    prize: null,
    thumbnail_url: null,
    color: null,
    emoji: null,
    end_at: null,
    num_winners: 1,
    auto_notify: true,
    rolled_at: "2026-08-09T18:50:35.400Z",
    rolled_by: "77",
    winner_ids: ["42"],
  }

  it("marks a winner's entry with the roll time and rank, and makes people for the creator and roller", () => {
    const r = run({
      giveaways: [giveaway],
      giveaway_entries: [
        { id: 1, guild_id: G, giveaway_id: 1, discord_user_id: "42" },
        { id: 2, guild_id: G, giveaway_id: 1, discord_user_id: "43" },
      ],
    })
    expect(r.tools.giveawayEntries).toEqual([
      { giveaway_key: "frogge:g:1", discord_user_id: "42", entered_at: NOW, won_at: "2026-08-09T18:50:35.400Z", winner_rank: 1 },
      { giveaway_key: "frogge:g:1", discord_user_id: "43", entered_at: NOW, won_at: null, winner_rank: null },
    ])
    expect(r.tools.giveaways[0]).toMatchObject({ created_by_person_key: "frogge:p:42", rolled_by_person_key: "frogge:p:77" })
  })

  it("notes an ended giveaway that was never rolled, since xvm-api would draw it", () => {
    const r = run({ giveaways: [{ ...giveaway, end_at: "2026-11-03T12:00:00.000Z", rolled_at: null, rolled_by: null, winner_ids: [] }] })
    expect(r.report.notes).toContain("giveaway 1 ended 2026-11-03T12:00:00.000Z and was never rolled, so xvm-api draws it on its first tick and posts the winners")
  })

  it("does not note a giveaway that is rolled or has not ended", () => {
    const r = run({
      giveaways: [
        { ...giveaway, id: 1, end_at: "2026-11-03T12:00:00.000Z" },
        { ...giveaway, id: 2, end_at: "2026-11-05T12:00:00.000Z", rolled_at: null, rolled_by: null, winner_ids: [] },
        { ...giveaway, id: 3, end_at: null, rolled_at: null, rolled_by: null, winner_ids: [] },
      ],
    })
    expect(r.report.notes.filter((n) => n.startsWith("giveaway "))).toEqual([])
  })

  it("reports a winner who has no entry", () => {
    const r = run({ giveaways: [giveaway] })
    expect(r.report.dropped).toEqual([{ what: "giveaway winner", id: "1:42", reason: "the winner has no entry row" }])
  })

  it("turns the winner percent into basis points", () => {
    const r = run({
      raffles: [
        {
          id: 6,
          guild_id: G,
          created_by: "42",
          name: null,
          cost_per_ticket: 100000,
          winner_pct: 50,
          num_winners: 1,
          auto_notify: true,
          rolled_at: null,
          rolled_by: null,
          winner_ids: [],
        },
      ],
      raffle_entries: [{ id: 3, guild_id: G, raffle_id: 6, discord_user_id: "42", quantity: 35 }],
    })
    expect(r.tools.raffles[0]).toMatchObject({ winner_basis_points: 5000, rolled_by_person_key: null })
    expect(r.tools.raffleEntries[0]).toMatchObject({ quantity: 35, won_at: null })
  })
})

describe("templates", () => {
  it("renames the message template types and drops an unknown one", () => {
    const r = run({
      message_templates: [
        { id: 1, guild_id: G, template_type: "channel_greeting", title: null, description: "Hi {member}", is_active: true },
        { id: 2, guild_id: G, template_type: "something_new", title: null, description: null, is_active: true },
      ],
    })
    expect(r.tools.messageTemplates).toEqual([{ venue_key: "venue-a", template_type: "greeting.channel", title: null, description: "Hi {member}", is_active: true }])
    expect(r.report.dropped).toHaveLength(1)
  })

  it("builds an event template from its data blob", () => {
    const r = run({
      event_templates: [
        { id: 1, guild_id: G, name: "Opening", data: { description: "d", default_start_time_minutes: 1320, duration_minutes: null, positions: [{ id: 1 }] } },
      ],
    })
    expect(r.tools.eventTemplates).toEqual([
      { venue_key: "venue-a", name: "Opening", title: "Opening", description: "d", default_start_minute_of_day: 1320, default_duration_minutes: null },
    ])
    expect(r.report.counts["event template position lists not carried"]).toBe(1)
  })
})

describe("the rest", () => {
  it("skips a quote board row with nothing set", () => {
    const r = run({
      quote_board_settings: [{ guild_id: G, board_channel_id: null, emoji: "x", reaction_threshold: 1, allow_nsfw_sources: false, blacklisted_channel_ids: [] }],
    })
    expect(r.tools.quoteBoardSettings).toEqual([])
  })

  it("renames a sticky message's timestamp and counts the images it leaves", () => {
    const r = run({
      sticky_messages: [
        {
          id: 1,
          guild_id: G,
          channel_id: "9",
          enabled: true,
          title: "t",
          description: null,
          color: null,
          url: null,
          timestamp: NOW,
          header_text: null,
          header_url: null,
          footer_text: null,
          header_icon_url: null,
          footer_icon_url: null,
          thumbnail_url: "https://x/a.png",
          image_url: "https://x/b.png",
        },
      ],
    })
    expect(r.tools.stickyMessages[0]).toMatchObject({ channel_id: "9", timestamp_at: NOW })
    expect(r.report.counts["sticky message images not carried"]).toBe(2)
  })

  it("maps the embed's main image and keeps its fields", () => {
    const r = run({
      custom_embeds: [
        {
          id: 1,
          guild_id: G,
          name: "e",
          title: null,
          description: null,
          color: null,
          url: null,
          timestamp: null,
          header_text: null,
          header_icon_url: null,
          header_url: null,
          footer_text: null,
          footer_icon_url: null,
          thumbnail_url: null,
          main_image_url: "https://x/m.png",
        },
      ],
      custom_embed_fields: [{ id: 1, guild_id: G, custom_embed_id: 1, name: "n", value: "v", inline: true, sort_order: 0 }],
    })
    expect(r.tools.customEmbeds[0]).toMatchObject({ key: "frogge:ce:1", image_url: "https://x/m.png" })
    expect(r.tools.customEmbedFields[0]).toMatchObject({ custom_embed_key: "frogge:ce:1" })
  })

  it("drops rows of a server that is not a venue", () => {
    const r = run({ rooms: [{ id: 1, guild_id: "999", room_number: 1, name: null, description: null, owner_id: null, locked: false, disabled: false }] })
    expect(r.tools.rooms).toEqual([])
    expect(r.report.dropped).toHaveLength(1)
  })

  it("carries a room and counts an owner it cannot", () => {
    const r = run({ rooms: [{ id: 1, guild_id: G, room_number: 2, name: "Suite", description: "d", owner_id: "5", locked: true, disabled: false }] })
    expect(r.tools.rooms).toEqual([{ venue_key: "venue-a", name: "Suite", notes: "d", room_number: 2, locked: true, disabled: false }])
    expect(r.report.counts["room owners not carried"]).toBe(1)
  })
})
