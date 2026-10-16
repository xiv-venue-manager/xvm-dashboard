export function getServerTimeLabel(): string {
  return "ST"
}

// All times displayed in UTC = FFXIV Server Time (ST). The formatters below
// are pure functions, deliberately NOT in components/server-time.tsx so they
// can be called from React Server Components.

const ST_TZ = "Etc/UTC"
export const SERVER_TIME_LABEL = "ST"

export type ServerTimeKind =
  | "time" // 8:54 PM
  | "datetime" // Apr 28, 8:54 PM
  | "date" // Apr 28
  | "datelong" // April 28, 2026
  | "datetimelong" // Apr 28, 2026, 8:54 PM
  | "isoDate" // 2026-04-28
  | "isoDateTime" // 2026-04-28 20:54:10
  | "weekdatelong" // Tuesday, April 28, 2026
  | "weekdate" // Tuesday 28 April
  | "shiftdate" // Tue 28 Apr
  | "dayheader" // Tuesday 28 Apr
  | "datewithyear" // Apr 28, 2026
  | "monthyear" // April 2026
  | "monthShort" // Apr
  | "dayOfMonth" // 28

export function getServerTimeIntlOptions(kind: ServerTimeKind): { opts: Intl.DateTimeFormatOptions; locale: string } {
  const opts: Intl.DateTimeFormatOptions = {}
  let locale = "en-US"
  if (kind === "time") {
    opts.hour = "numeric"
    opts.minute = "2-digit"
  } else if (kind === "datetime") {
    opts.month = "short"
    opts.day = "numeric"
    opts.hour = "numeric"
    opts.minute = "2-digit"
  } else if (kind === "date") {
    opts.month = "short"
    opts.day = "numeric"
  } else if (kind === "datelong") {
    opts.year = "numeric"
    opts.month = "long"
    opts.day = "numeric"
  } else if (kind === "datetimelong") {
    opts.year = "numeric"
    opts.month = "short"
    opts.day = "numeric"
    opts.hour = "numeric"
    opts.minute = "2-digit"
  } else if (kind === "weekdatelong") {
    opts.weekday = "long"
    opts.year = "numeric"
    opts.month = "long"
    opts.day = "numeric"
  } else if (kind === "weekdate") {
    opts.weekday = "long"
    opts.month = "long"
    opts.day = "numeric"
    locale = "en-GB"
  } else if (kind === "shiftdate") {
    opts.weekday = "short"
    opts.day = "numeric"
    opts.month = "short"
    locale = "en-GB"
  } else if (kind === "dayheader") {
    opts.weekday = "long"
    opts.day = "numeric"
    opts.month = "short"
    locale = "en-GB"
  } else if (kind === "datewithyear") {
    opts.month = "short"
    opts.day = "numeric"
    opts.year = "numeric"
  } else if (kind === "monthyear") {
    opts.month = "long"
    opts.year = "numeric"
  } else if (kind === "monthShort") {
    opts.month = "short"
  } else if (kind === "dayOfMonth") {
    opts.day = "numeric"
  }
  return { opts, locale }
}

export function formatServerTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)

  if (kind === "isoDate") return d.toISOString().slice(0, 10)
  if (kind === "isoDateTime") return d.toISOString().replace("T", " ").slice(0, 19)

  const { opts, locale } = getServerTimeIntlOptions(kind)
  return d.toLocaleString(locale, { ...opts, timeZone: ST_TZ })
}

export function formatServerTimeRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  const dateStr = s.toLocaleString("en-US", { timeZone: ST_TZ, month: "short", day: "numeric" })
  const startTime = s.toLocaleString("en-US", { timeZone: ST_TZ, hour: "numeric", minute: "2-digit" })
  const endTime = e.toLocaleString("en-US", { timeZone: ST_TZ, hour: "numeric", minute: "2-digit" })
  return `${dateStr} · ${startTime} — ${endTime} ${SERVER_TIME_LABEL}`
}

export function formatLocalTimeRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  const dateStr = s.toLocaleString("en-US", { month: "short", day: "numeric" })
  const startTime = s.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
  const endTime = e.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${dateStr} · ${startTime} — ${endTime}`
}
