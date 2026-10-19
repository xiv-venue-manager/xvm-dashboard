export interface ExportedEvent {
  id: string
  venueId: string
  title: string
  description: string | null
  location: string | null
  eventType: string
  status: "DRAFT" | "PUBLISHED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
  startTime: string
  endTime: string
  timezone: string
  recurrenceRule: string | null
  parentEventId: string | null
  partakeEventId: number | null
  discordMessageId: string | null
  discordWebhookGroup: string | null
  discordCancelledAt: string | null
  discordReminderSentAt: string | null
  attendanceCount: number | null
  revenue: number | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface EventsExport {
  events: ExportedEvent[]
}

export type RuleInterval = "weekly" | "biweekly" | "monthly_by_date" | "monthly_by_weekday"

export interface RuleRow {
  key: string
  venue_key: string
  interval: RuleInterval
  weekday: number | null
  day_of_month: number | null
  week_of_month: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone: string
  anchor_date: string
  ends_on: null
  ends_after_count: null
  enabled: boolean
}

export interface EventRow {
  key: string
  venue_key: string
  rule_key: string | null
  scheduled_at: string | null
  title: string
  description: string | null
  event_type: string
  location: string | null
  starts_at: string
  ends_at: string
  published_at: string | null
  cancelled_at: string | null
  partake_event_id: number | null
  reminder_sent_at: string | null
  cancel_notice_sent_at: string | null
  created_by_person_key: string | null
  created_at: string
  updated_at: string
}

export interface EventTotalsRow {
  event_key: string
  attendance_count: number | null
  revenue_minor: number | null
}

export interface EventsResult {
  rules: RuleRow[]
  events: EventRow[]
  totals: EventTotalsRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_TITLE = 200
const MAX_LOCATION = 250
const MAX_TYPE = 32
const DEFAULT_LENGTH_MS = 3 * 60 * 60 * 1000
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface LocalParts {
  date: string
  day: number
  weekday: number
  minuteOfDay: number
}

function localParts(iso: string, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: Number(parts.day),
    weekday: DAY_NAMES.indexOf(parts.weekday),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const weekOfMonth = (day: number) => Math.floor((day - 1) / 7) + 1

function mostCommon<T>(values: T[]): { value: T; count: number } {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = { value: values[0], count: 0 }
  for (const [value, count] of counts) if (count > best.count) best = { value, count }
  return best
}

function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = localParts(new Date(utcMs).toISOString(), timeZone)
  const [y, m, d] = p.date.split("-").map(Number)
  return (Date.UTC(y, m - 1, d, 0, p.minuteOfDay) - Math.floor(utcMs / 60000) * 60000) / 60000
}

function localToUtc(date: string, minuteOfDay: number, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minuteOfDay)
  let guess = wall - offsetMinutes(wall, timeZone) * 60000
  guess = wall - offsetMinutes(guess, timeZone) * 60000
  return new Date(guess).toISOString()
}

const sortKey = (a: ExportedEvent, b: ExportedEvent) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)

export function mapEvents(source: EventsExport, personKeys: ReadonlySet<string>): EventsResult {
  const result: EventsResult = { rules: [], events: [], totals: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const byId = new Map(source.events.map((e) => [e.id, e]))
  const children = new Map<string, ExportedEvent[]>()
  for (const e of source.events) {
    if (e.parentEventId) children.set(e.parentEventId, [...(children.get(e.parentEventId) ?? []), e])
  }

  const endFor = (e: ExportedEvent) => {
    if (new Date(e.endTime).getTime() > new Date(e.startTime).getTime()) return e.endTime
    return new Date(new Date(e.startTime).getTime() + DEFAULT_LENGTH_MS).toISOString()
  }

  const ruleOf = new Map<string, string>()

  const canonical = new Map<string, string>()

  for (const parent of [...source.events].filter((e) => e.recurrenceRule).sort(sortKey)) {
    const series = [parent, ...(children.get(parent.id) ?? [])].sort(sortKey)
    const tz = parent.timezone
    const locals = series.map((e) => localParts(e.startTime, tz))
    const minute = mostCommon(locals.map((l) => l.minuteOfDay)).value
    const durationMinutes = mostCommon(series.map((e) => Math.round((new Date(endFor(e)).getTime() - new Date(e.startTime).getTime()) / 60000))).value

    let interval: RuleInterval
    let weekday: number | null = null
    let dayOfMonth: number | null = null
    let weekOfMonthValue: number | null = null
    let offPattern = 0

    if (parent.recurrenceRule === "WEEKLY" || parent.recurrenceRule === "BIWEEKLY") {
      interval = parent.recurrenceRule === "WEEKLY" ? "weekly" : "biweekly"
      const common = mostCommon(locals.map((l) => l.weekday))
      weekday = common.value
      offPattern = series.length - common.count
    } else if (parent.recurrenceRule === "MONTHLY") {
      const byDate = mostCommon(locals.map((l) => l.day))
      const bySlot = mostCommon(locals.map((l) => `${l.weekday}:${weekOfMonth(l.day)}`))
      if (byDate.count >= bySlot.count) {
        interval = "monthly_by_date"
        dayOfMonth = byDate.value
        offPattern = series.length - byDate.count
      } else {
        interval = "monthly_by_weekday"
        const [wd, wk] = bySlot.value.split(":").map(Number)
        weekday = wd
        weekOfMonthValue = wk
        offPattern = series.length - bySlot.count
      }
    } else {
      skip(parent.id, `unknown recurrence ${JSON.stringify(parent.recurrenceRule)}`)
      continue
    }

    const moved = series.filter((_, i) => locals[i].minuteOfDay !== minute).length
    if (moved > 0) {
      warn(parent.id, `${moved} of ${series.length} occurrences start at a different local time than the series, daylight saving or an edit, their real times are kept`)
    }
    if (offPattern > 0) {
      warn(parent.id, `${offPattern} of ${series.length} occurrences are not on the series' ${interval.startsWith("monthly_by_date") ? "date" : "weekday"}, their real dates are kept`)
    }

    result.rules.push({
      key: parent.id,
      venue_key: parent.venueId,
      interval,
      weekday,
      day_of_month: dayOfMonth,
      week_of_month: weekOfMonthValue,
      start_minute_of_day: minute,
      duration_minutes: durationMinutes,
      timezone: tz,
      anchor_date: locals[0].date,
      ends_on: null,
      ends_after_count: null,
      enabled: true,
    })

    const taken = new Set<string>()
    series.forEach((e, i) => {
      const slot = localToUtc(locals[i].date, minute, tz)
      if (taken.has(slot)) {
        warn(e.id, "two occurrences share one series slot, kept the earlier")
        return
      }
      taken.add(slot)
      ruleOf.set(e.id, parent.id)
      canonical.set(e.id, slot)
    })
  }

  for (const e of [...source.events].sort(sortKey)) {
    if (e.parentEventId && !byId.has(e.parentEventId)) {
      skip(e.id, "parent event not found")
      continue
    }
    if (e.parentEventId && !ruleOf.has(e.id)) {
      skip(e.id, "belongs to a series that was not mapped")
      continue
    }

    let title = e.title.trim()
    let description = e.description === null ? null : e.description.trim() || null
    if (title.length > MAX_TITLE) {
      description = description === null ? title : `${title}\n\n${description}`
      title = title.slice(0, MAX_TITLE)
      warn(e.id, `title cut to ${MAX_TITLE} characters, the full title is at the top of the description`)
    }
    if (!title) {
      skip(e.id, "blank title")
      continue
    }

    let location = e.location === null ? null : e.location.trim() || null
    if (location !== null && location.length > MAX_LOCATION) {
      location = location.slice(0, MAX_LOCATION)
      warn(e.id, `location cut to ${MAX_LOCATION} characters`)
    }

    if (endFor(e) !== e.endTime) warn(e.id, "end is not after start, set to start plus 3 hours")

    const ruleKey = ruleOf.get(e.id) ?? null
    const cancelled = e.status === "CANCELLED"
    const published = e.status !== "DRAFT" && !cancelled

    let createdBy: string | null = e.createdById
    if (!personKeys.has(e.createdById)) {
      createdBy = null
      warn(e.id, "creator was not loaded, created_by left empty")
    }

    if (e.discordMessageId || e.discordWebhookGroup) {
      warn(e.id, "Discord post tracking (message id, webhook group) has no xvm-api home, not migrated")
    }

    result.events.push({
      key: e.id,
      venue_key: e.venueId,
      rule_key: ruleKey,
      scheduled_at: ruleKey ? (canonical.get(e.id) ?? null) : null,
      title,
      description,
      event_type: e.eventType.slice(0, MAX_TYPE),
      location,
      starts_at: e.startTime,
      ends_at: endFor(e),
      published_at: published ? e.createdAt : null,
      cancelled_at: cancelled ? (e.discordCancelledAt ?? e.updatedAt) : null,
      partake_event_id: e.partakeEventId,
      reminder_sent_at: e.discordReminderSentAt,
      cancel_notice_sent_at: e.discordCancelledAt,
      created_by_person_key: createdBy,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    })

    if (e.attendanceCount !== null || e.revenue !== null) {
      result.totals.push({
        event_key: e.id,
        attendance_count: e.attendanceCount,
        revenue_minor: e.revenue === null ? null : Math.round(e.revenue),
      })
    }
  }

  return result
}
