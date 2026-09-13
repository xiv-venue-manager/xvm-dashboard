/** "2026-01-15" for the given date, as a calendar day in the given IANA timezone. */
export function localDayKey(d: Date | string, timeZone: string): string {
  const date = new Date(d)
  // en-CA gives YYYY-MM-DD directly, no manual reformatting needed.
  return date.toLocaleDateString("en-CA", { timeZone })
}

/** "10PM" or "10:30PM", read in the given IANA timezone. */
export function localHourLabel(d: Date | string, timeZone: string): string {
  const date = new Date(d)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date)
  const hour = parts.find((p) => p.type === "hour")?.value ?? ""
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase()
  return minute === "00" ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
}

/** The viewer's IANA timezone, e.g. "Europe/London". Client-only. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** "HH:mm" (24h) for a date in the given timezone, for form input prefill. */
export function localTimeInput(d: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(d)
  )
}

/**
 * The UTC instant for 23:59:59.999 local wall-clock time, on the given
 * calendar day, in the given IANA timezone. Use this to bound a date-range
 * window's end so "the last day of the period" means that day's close in the
 * venue's own timezone, not UTC's - forcing UTC end-of-day silently excludes
 * a venue's late-evening local hours for any negative-offset timezone.
 */
export function endOfLocalDayUtc(dateStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T23:59:59.999Z`)
  // Both re-parsed with the same (arbitrary) local-machine offset, so that
  // offset cancels out of the difference below regardless of server timezone.
  const asIfUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }))
  const asIfZoned = new Date(guess.toLocaleString("en-US", { timeZone }))
  const offsetMs = asIfZoned.getTime() - asIfUtc.getTime()
  return new Date(guess.getTime() - offsetMs)
}
