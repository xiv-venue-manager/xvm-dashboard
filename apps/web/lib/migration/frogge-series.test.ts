import { describe, it, expect } from "vitest"
import { attachFroggeSeries, type FroggeSeriesExport, type SeriesFiles } from "./frogge-series"

const EAST = "1305743723644326020"
const UTC = "1090332740253130792"
const ctx = { venueKeyByGuild: { [EAST]: "venue-east", [UTC]: "venue-utc" } }

const event = (id: number, venue: string, startsAt: string, title: string, over: Record<string, unknown> = {}) => ({
  key: `frogge:e:${id}`,
  venue_key: venue,
  rule_key: null,
  scheduled_at: null,
  title,
  starts_at: startsAt,
  cancelled_at: null,
  ...over,
})

const files = (events: Record<string, unknown>[]): SeriesFiles => ({ rules: [{ key: "prisma-rule" }], events })

const source = (over: Partial<FroggeSeriesExport> = {}): FroggeSeriesExport => ({
  event_recurrence_rules: [
    {
      id: 1,
      guild_id: EAST,
      template_id: 3,
      weekday: 2,
      hour: 20,
      minute: 0,
      lead_days: 4,
      channel_id: "111",
      enabled: true,
    },
  ],
  event_templates: [
    { id: 3, guild_id: EAST, name: "FYLC - Time Clock", data: { duration_minutes: 240, positions: [{}, {}] } },
  ],
  guild_configurations: [{ guild_id: EAST, timezone: "US/Eastern" }],
  ...over,
})

const eastEvents = () => [
  event(9, "venue-east", "2026-10-15T00:00:00.000Z", "FYLC - Time Clock"),
  event(54, "venue-east", "2026-10-22T00:00:34.000Z", "FYLC - Time Clock"),
  event(60, "venue-east", "2026-10-29T00:00:00.000Z", "FYLC - Time Clock"),
  event(70, "venue-east", "2026-11-05T01:00:00.000Z", "FYLC - Time Clock"),
]

describe("attachFroggeSeries", () => {
  it("makes a weekly series in the server's timezone and puts its events on their slots across a clock change", () => {
    const { files: out, report } = attachFroggeSeries(source(), ctx, files(eastEvents()))
    expect(out.rules).toContainEqual({
      key: "frogge:series:1",
      venue_key: "venue-east",
      interval: "weekly",
      weekday: 2,
      day_of_month: null,
      week_of_month: null,
      start_minute_of_day: 1200,
      duration_minutes: 240,
      timezone: "America/New_York",
      anchor_date: "2026-10-14",
      ends_on: null,
      ends_after_count: null,
      enabled: true,
    })
    expect(out.rules).toHaveLength(2)
    expect(out.events.map((e) => [e.rule_key, e.scheduled_at])).toEqual([
      ["frogge:series:1", "2026-10-15T00:00:00.000Z"],
      ["frogge:series:1", "2026-10-22T00:00:00.000Z"],
      ["frogge:series:1", "2026-10-29T00:00:00.000Z"],
      ["frogge:series:1", "2026-11-05T01:00:00.000Z"],
    ])
    expect(out.events[1].starts_at).toBe("2026-10-22T00:00:34.000Z")
    expect(report.counts["event series carried"]).toBe(1)
    expect(report.counts["events attached to a series"]).toBe(4)
  })

  it("starts the series at the last unbroken run, so no empty weekly slot is listed as a night that never happened", () => {
    const gapped = [
      event(1, "venue-east", "2026-10-01T00:00:00.000Z", "FYLC - Time Clock"),
      event(2, "venue-east", "2026-10-08T00:00:00.000Z", "FYLC - Time Clock"),
      event(4, "venue-east", "2026-10-22T00:00:00.000Z", "FYLC - Time Clock"),
      event(5, "venue-east", "2026-10-29T00:00:00.000Z", "FYLC - Time Clock"),
    ]
    const { files: out, report } = attachFroggeSeries(source(), ctx, files(gapped))
    expect(out.rules.find((r) => r.key === "frogge:series:1")).toMatchObject({ anchor_date: "2026-10-21" })
    expect(out.events.map((e) => e.rule_key)).toEqual([null, null, "frogge:series:1", "frogge:series:1"])
    expect(report.counts["events before the last unbroken run left as one-offs"]).toBe(2)
    expect(report.counts["events attached to a series"]).toBe(2)
    expect(report.notes.some((n) => n.includes("2 earlier events stay as one-offs") && n.includes("2026-10-21"))).toBe(
      true
    )
  })

  it("breaks the run at a night whose event sat off the slot, since that slot would be listed empty beside it", () => {
    const offSlot = [
      event(1, "venue-east", "2026-10-08T00:00:00.000Z", "FYLC - Time Clock"),
      event(2, "venue-east", "2026-10-15T00:40:00.000Z", "FYLC - Time Clock"),
      event(3, "venue-east", "2026-10-22T00:00:00.000Z", "FYLC - Time Clock"),
    ]
    const { files: out } = attachFroggeSeries(source(), ctx, files(offSlot))
    expect(out.rules.find((r) => r.key === "frogge:series:1")).toMatchObject({ anchor_date: "2026-10-21" })
    expect(out.events.map((e) => e.rule_key)).toEqual([null, null, "frogge:series:1"])
  })

  it("reports that a new occurrence has no seats or image, and where the rule's channel went", () => {
    const { report } = attachFroggeSeries(source(), ctx, files(eastEvents()))
    expect(report.notes).toContain(
      "series 1 (FYLC - Time Clock): a new occurrence copies the previous one's title, description, type and location, not its 2 template seats or its image"
    )
    expect(report.notes).toContain(
      "series 1: the rule's channel 111 is not carried; new events post to the venue's events channel"
    )
    expect(report.notes.some((n) => n.includes("30 days ahead"))).toBe(true)
  })

  it("gives the slot to the event named like the template and leaves the other as a one-off", () => {
    const { files: out, report } = attachFroggeSeries(
      source({
        event_recurrence_rules: [
          {
            id: 2,
            guild_id: UTC,
            template_id: 13,
            weekday: 3,
            hour: 20,
            minute: 0,
            lead_days: 2,
            channel_id: null,
            enabled: true,
          },
        ],
        event_templates: [
          { id: 13, guild_id: UTC, name: "Weekly Opening Announcement", data: { duration_minutes: null } },
        ],
        guild_configurations: [{ guild_id: UTC, timezone: "UTC" }],
      }),
      ctx,
      files([
        event(59, "venue-utc", "2026-11-05T20:00:42.000Z", "Weekly Opening"),
        event(60, "venue-utc", "2026-11-05T20:00:00.000Z", "Weekly Opening Announcement"),
      ])
    )
    expect(out.events.map((e) => [e.key, e.rule_key, e.scheduled_at])).toEqual([
      ["frogge:e:59", null, null],
      ["frogge:e:60", "frogge:series:2", "2026-11-05T20:00:00.000Z"],
    ])
    expect(out.rules.find((r) => r.key === "frogge:series:2")).toMatchObject({
      timezone: "UTC",
      duration_minutes: 180,
      anchor_date: "2026-11-05",
    })
    expect(report.counts["events at a series slot left as one-offs"]).toBe(1)
  })

  it("drops a rule no event sits on, a rule for a server that is not a venue, a bad timezone and a bad time", () => {
    const rules = [
      {
        id: 1,
        guild_id: EAST,
        template_id: 3,
        weekday: 4,
        hour: 20,
        minute: 0,
        lead_days: 4,
        channel_id: null,
        enabled: true,
      },
      {
        id: 2,
        guild_id: "999",
        template_id: 3,
        weekday: 2,
        hour: 20,
        minute: 0,
        lead_days: 4,
        channel_id: null,
        enabled: true,
      },
      {
        id: 3,
        guild_id: UTC,
        template_id: 3,
        weekday: 2,
        hour: 20,
        minute: 0,
        lead_days: 4,
        channel_id: null,
        enabled: true,
      },
      {
        id: 4,
        guild_id: EAST,
        template_id: 3,
        weekday: 9,
        hour: 20,
        minute: 0,
        lead_days: 4,
        channel_id: null,
        enabled: true,
      },
    ]
    const { files: out, report } = attachFroggeSeries(
      source({
        event_recurrence_rules: rules,
        guild_configurations: [
          { guild_id: EAST, timezone: "US/Eastern" },
          { guild_id: UTC, timezone: "Mars/Olympus" },
        ],
      }),
      ctx,
      files(eastEvents())
    )
    expect(out.rules).toHaveLength(1)
    expect(out.events.every((e) => e.rule_key === null)).toBe(true)
    expect(report.dropped.map((d) => [d.id, d.reason.split(",")[0]])).toEqual([
      ["1", "no event of this server sits on the rule's slot (weekday 4 at 20:00 in America/New_York)"],
      ["2", "server 999 is not a migrated venue"],
      ["3", "Mars/Olympus is not a timezone xvm-api can read"],
      ["4", "weekday 9 at 20:0 is not a time of the week"],
    ])
  })

  it("leaves alone events of other venues, events already in a series, events not made from Frogge, and cancelled ones", () => {
    const { files: out } = attachFroggeSeries(
      source(),
      ctx,
      files([
        event(1, "venue-utc", "2026-10-15T00:00:00.000Z", "Elsewhere"),
        event(2, "venue-east", "2026-10-22T00:00:00.000Z", "Already", {
          rule_key: "prisma-rule",
          scheduled_at: "2026-10-22T00:00:00.000Z",
        }),
        { ...event(3, "venue-east", "2026-10-29T00:00:00.000Z", "Ours"), key: "e-ours" },
        event(4, "venue-east", "2026-11-05T01:00:00.000Z", "Cancelled", { cancelled_at: "2026-11-01T00:00:00.000Z" }),
        event(5, "venue-east", "2026-11-12T01:00:00.000Z", "The one"),
      ])
    )
    expect(out.events.map((e) => e.rule_key)).toEqual([null, "prisma-rule", null, null, "frogge:series:1"])
  })

  it("does not change the files it was given", () => {
    const input = files(eastEvents())
    const before = structuredClone(input)
    attachFroggeSeries(source(), ctx, input)
    expect(input).toEqual(before)
  })
})
