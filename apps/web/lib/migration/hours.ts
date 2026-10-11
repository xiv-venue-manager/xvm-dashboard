export interface ExportedScheduleEntry {
  id: string
  venueId: string
  day: number
  startHour: number
  startMin: number
  endHour: number | null
  endMin: number | null
  crossesMidnight: boolean
  interval: "WEEKLY" | "BIWEEKLY" | "MONTHLY"
  weekOfMonth: number | null
  commencing: string | null
  label: string | null
  createdAt: string
}

export interface HoursExport {
  entries: ExportedScheduleEntry[]
  syncedVenues: string[]
}

export interface HoursRuleRow {
  interval: "weekly" | "biweekly" | "monthly_by_weekday"
  weekday: number
  day_of_month: null
  week_of_month: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone: "UTC"
  anchor_date: string
  ends_on: null
  ends_after_count: null
  enabled: true
}

export interface HoursRow {
  key: string
  venue_key: string
  label: string | null
  source: "manual"
  rule: HoursRuleRow
}

export interface HoursResult {
  hours: HoursRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const DAY = 1440
const DEFAULT_LENGTH = 180
const MAX_LABEL = 100
const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapHours(source: HoursExport): HoursResult {
  const result: HoursResult = { hours: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })
  const synced = new Set(source.syncedVenues)

  let unflaggedMidnight = 0
  let defaultedEnd = 0

  for (const e of [...source.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (synced.has(e.venueId)) {
      skip(e.id, "this venue's hours come from ffxivvenues.com")
      continue
    }
    if (e.day < 0 || e.day > 6 || e.startHour < 0 || e.startHour > 23 || e.startMin < 0 || e.startMin > 59) {
      skip(e.id, "day or start time out of range")
      continue
    }

    const start = e.startHour * 60 + e.startMin
    let duration: number
    if (e.endHour === null || e.endMin === null) {
      duration = DEFAULT_LENGTH
      defaultedEnd++
    } else {
      const end = e.endHour * 60 + e.endMin
      if (end > start) duration = end - start
      else {
        duration = end + DAY - start
        if (!e.crossesMidnight) unflaggedMidnight++
      }
    }
    if (duration <= 0 || duration > DAY) {
      skip(e.id, "length is not between a minute and a day")
      continue
    }

    let interval: HoursRuleRow["interval"]
    let weekOfMonth: number | null = null
    let anchor = (e.commencing ?? e.createdAt).slice(0, 10)
    if (e.interval === "WEEKLY") interval = "weekly"
    else if (e.interval === "BIWEEKLY") {
      interval = "biweekly"
      if (e.commencing === null) warn(e.id, "biweekly with no start date, anchored on when the entry was created")
    } else {
      if (e.weekOfMonth === null || e.weekOfMonth < 1 || e.weekOfMonth > 5) {
        skip(e.id, "monthly entry without a week of the month")
        continue
      }
      interval = "monthly_by_weekday"
      weekOfMonth = e.weekOfMonth === 5 ? -1 : e.weekOfMonth
      anchor = e.createdAt.slice(0, 10)
    }

    const label = e.label === null ? null : squash(e.label).slice(0, MAX_LABEL) || null
    result.hours.push({
      key: e.id,
      venue_key: e.venueId,
      label,
      source: "manual",
      rule: {
        interval,
        weekday: (e.day + 6) % 7,
        day_of_month: null,
        week_of_month: weekOfMonth,
        start_minute_of_day: start,
        duration_minutes: duration,
        timezone: "UTC",
        anchor_date: anchor,
        ends_on: null,
        ends_after_count: null,
        enabled: true,
      },
    })
  }

  if (unflaggedMidnight > 0) warn("hours", `${unflaggedMidnight} entries ended before they started without the crosses-midnight flag, treated as ending the next day`)
  if (defaultedEnd > 0) warn("hours", `${defaultedEnd} entries had no end time, given a default length of ${DEFAULT_LENGTH / 60} hours`)
  return result
}
