import { localParts, localToUtc, type RuleRow } from "./events"

type Row = Record<string, unknown>

export interface FroggeSeriesExport {
  event_recurrence_rules: {
    id: number
    guild_id: string
    template_id: number
    weekday: number
    hour: number
    minute: number
    lead_days: number
    channel_id: string | null
    enabled: boolean
  }[]
  event_templates: {
    id: number
    guild_id: string
    name: string
    data: { duration_minutes?: number | null; positions?: unknown } & Record<string, unknown>
  }[]
  guild_configurations: { guild_id: string; timezone?: string | null }[]
}

export interface SeriesFiles {
  rules: Row[]
  events: Row[]
}

export interface SeriesReport {
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
  notes: string[]
}

const TZ_ALIASES: Record<string, string> = {
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Alaska": "America/Anchorage",
}
const DEFAULT_DURATION_MINUTES = 180
const MAX_DURATION_MINUTES = 7 * 24 * 60
const SLOT_TOLERANCE_MINUTES = 10
const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function attachFroggeSeries(
  source: FroggeSeriesExport,
  ctx: { venueKeyByGuild: Record<string, string> },
  files: SeriesFiles
): { files: SeriesFiles; report: SeriesReport } {
  const out = structuredClone(files)
  const report: SeriesReport = { counts: {}, dropped: [], notes: [] }
  const bump = (name: string, by = 1) => (report.counts[name] = (report.counts[name] ?? 0) + by)
  const drop = (id: number, reason: string) =>
    report.dropped.push({ what: "event recurrence rule", id: String(id), reason })
  const zoneByGuild = new Map(source.guild_configurations.map((c) => [c.guild_id, c.timezone] as const))

  for (const rule of [...source.event_recurrence_rules].sort((a, b) => a.id - b.id)) {
    const venueKey = ctx.venueKeyByGuild[rule.guild_id]
    if (!venueKey) {
      drop(rule.id, `server ${rule.guild_id} is not a migrated venue`)
      continue
    }
    const raw = (zoneByGuild.get(rule.guild_id) ?? "").trim() || "UTC"
    const timezone = TZ_ALIASES[raw] ?? raw
    if (!validZone(timezone)) {
      drop(rule.id, `${raw} is not a timezone xvm-api can read`)
      continue
    }
    if (
      !Number.isInteger(rule.weekday) ||
      rule.weekday < 0 ||
      rule.weekday > 6 ||
      !(rule.hour >= 0 && rule.hour <= 23) ||
      !(rule.minute >= 0 && rule.minute <= 59)
    ) {
      drop(rule.id, `weekday ${rule.weekday} at ${rule.hour}:${rule.minute} is not a time of the week`)
      continue
    }
    const template = source.event_templates.find((t) => t.id === rule.template_id)
    const length = template?.data.duration_minutes
    const duration =
      Number.isInteger(length) && (length as number) >= 1 && (length as number) <= MAX_DURATION_MINUTES
        ? (length as number)
        : DEFAULT_DURATION_MINUTES
    const minuteOfDay = rule.hour * 60 + rule.minute

    const onSlot = out.events
      .filter(
        (e) => e.venue_key === venueKey && String(e.key).startsWith("frogge:e:") && !e.rule_key && !e.cancelled_at
      )
      .map((e) => ({ event: e, local: localParts(String(e.starts_at), timezone) }))
      .filter(
        ({ local }) =>
          local.weekday === rule.weekday && Math.abs(local.minuteOfDay - minuteOfDay) <= SLOT_TOLERANCE_MINUTES
      )
    if (onSlot.length === 0) {
      drop(
        rule.id,
        `no event of this server sits on the rule's slot (weekday ${rule.weekday} at ${rule.hour}:${String(rule.minute).padStart(2, "0")} in ${timezone}), so the rule's time cannot be checked`
      )
      continue
    }

    const wanted = (template?.name ?? "").trim().toLowerCase()
    const named = (e: Row) => Number(String(e.title).trim().toLowerCase() === wanted)
    const bySlot = new Map<string, typeof onSlot>()
    for (const candidate of onSlot) {
      const slot = localToUtc(candidate.local.date, minuteOfDay, timezone)
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), candidate])
    }
    const key = `frogge:series:${rule.id}`
    const picks: { event: Row; slot: string; date: string }[] = []
    for (const [slot, candidates] of bySlot) {
      const distance = (e: Row) => Math.abs(new Date(String(e.starts_at)).getTime() - new Date(slot).getTime())
      const best = [...candidates].sort(
        (a, b) =>
          named(b.event) - named(a.event) ||
          distance(a.event) - distance(b.event) ||
          String(a.event.key).localeCompare(String(b.event.key))
      )[0]
      picks.push({ event: best.event, slot, date: best.local.date })
      if (candidates.length > 1) bump("events at a series slot left as one-offs", candidates.length - 1)
    }

    const dates = picks.map((p) => p.date).sort()
    let first = dates.length - 1
    while (first > 0 && daysBetween(dates[first - 1], dates[first]) === 7) first--
    const anchorDate = dates[first]
    const attached = picks.filter((p) => p.date >= anchorDate)
    for (const p of attached) {
      p.event.rule_key = key
      p.event.scheduled_at = p.slot
    }
    const earlier = picks.length - attached.length
    if (earlier > 0) {
      bump("events before the last unbroken run left as one-offs", earlier)
      report.notes.push(
        `series ${rule.id}: ${earlier} earlier ${earlier === 1 ? "event" : "events"} stay as one-offs, because xvm-api lists every empty weekly slot from the series' first night and the series starts at ${anchorDate}, the first night of its last unbroken run`
      )
    }

    const row: RuleRow = {
      key,
      venue_key: venueKey,
      interval: "weekly",
      weekday: rule.weekday,
      day_of_month: null,
      week_of_month: null,
      start_minute_of_day: minuteOfDay,
      duration_minutes: duration,
      timezone,
      anchor_date: anchorDate,
      ends_on: null,
      ends_after_count: null,
      enabled: rule.enabled,
    }
    out.rules.push({ ...row })
    bump("event series carried")
    bump("events attached to a series", attached.length)

    const seats = Array.isArray(template?.data.positions) ? template.data.positions.length : 0
    report.notes.push(
      `series ${rule.id} (${template?.name ?? `template ${rule.template_id}`}): a new occurrence copies the previous one's title, description, type and location, not its ${seats} template seats or its image`
    )
    if (rule.channel_id)
      report.notes.push(
        `series ${rule.id}: the rule's channel ${rule.channel_id} is not carried; new events post to the venue's events channel`
      )
  }

  if (report.counts["event series carried"]) {
    report.notes.push(
      "xvm-api creates a series' occurrences up to 30 days ahead, where Frogge created them a few days ahead"
    )
  }
  return { files: out, report }
}
