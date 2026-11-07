import { LOAD_ARRAYS, type MappedFiles } from "./prepare-load"

type Row = Record<string, unknown>

export interface Counts {
  takenAt?: string
  tables: Record<string, number>
  metrics?: Record<string, number>
}

export type ExportFiles = Record<string, Row | undefined>

export type Disposition =
  | { kind: "exported"; source: string }
  | { kind: "nested"; source: string; field: string }
  | { kind: "folded"; into: string; metric: string }
  | { kind: "filtered"; source: string; metric: string; filter: string }
  | { kind: "not_migrated"; decision: string; confirmed: boolean }
  | { kind: "separate"; note: string }
  | { kind: "expect_empty"; note: string }
  | { kind: "ignored"; note: string }
  | { kind: "undecided"; note: string }

const exported = (source: string): Disposition => ({ kind: "exported", source })
const dropped = (decision: string, confirmed = true): Disposition => ({ kind: "not_migrated", decision, confirmed })
const empty = (note: string): Disposition => ({ kind: "expect_empty", note })

// Every table in prod's venue_manager database, and what happens to its rows. A table that is not listed here fails the
// report, so a new table cannot be added to prod without someone deciding what becomes of it.
export const TABLES: Record<string, Disposition> = {
  users: exported("people.users"),
  venues: exported("venues.venues"),
  memberships: exported("positions.memberships"),
  roles: exported("positions.roles"),
  services: exported("services.services"),
  user_characters: exported("characters.characters"),
  events: exported("events.events"),
  transactions: exported("finance.transactions"),
  payroll_entries: exported("finance.payroll"),
  venue_follows: exported("follows-feedback.follows"),
  feedback: exported("follows-feedback.feedback"),
  venue_schedule_entries: exported("hours.entries"),
  patrons: exported("patrons.patrons"),
  patron_logs: exported("patrons.logs"),
  venue_pot_settings: exported("settings.pot"),
  venue_inventory_settings: exported("settings.inventory"),
  shifts: exported("shifts.shifts"),
  shift_audit_logs: exported("shifts.audits"),
  tasks: exported("tasks-rooms.tasks"),
  rooms: exported("tasks-rooms.rooms"),
  membership_role_assignments: { kind: "nested", source: "positions.memberships", field: "additionalRoleIds" },
  _RoleToService: { kind: "nested", source: "services.services", field: "roleIds" },
  accounts: { kind: "folded", into: "people.users (discordAccountId)", metric: "accounts_not_carried" },
  venue_schedules: {
    kind: "filtered",
    source: "hours.syncedVenues",
    metric: "venue_schedules_not_ffxivvenues",
    filter: "source = 'ffxivvenues'",
  },
  api_keys: dropped("decision 6: plugin users relink with a code, old keys are not carried"),
  refresh_tokens: dropped("ephemeral login state, everyone signs in again"),
  sessions: dropped("ephemeral login state, everyone signs in again"),
  pending_notifications: dropped("a queue whose readers are gone, never loaded (manifest)"),
  notifications: dropped("decision 15 (2026-11-07): in-app notification history is not carried"),
  notification_preferences: dropped("the notification toggles are dropped"),
  announcements: dropped("decision 9: old announcements are dropped"),
  announcement_dismissals: dropped("decision 9: old announcements are dropped"),
  discord_members: dropped("decision 13 (2026-11-06, reconfirmed 2026-11-07): old-bot XP is not carried"),
  discord_warn_logs: dropped("2026-11-06: old-bot warns are left to Discord's moderation"),
  shift_signup_embeds: dropped(
    "the old shift-embed pipeline is gone; waitlists checked on prod 2026-11-07, none upcoming"
  ),
  discord_open_venues: dropped("manifest default: dropped with the old bot, not yet confirmed", false),
  discord_tracked_messages: dropped("manifest default: dropped with the old bot, not yet confirmed", false),
  discord_gil_reaction_rewards: dropped("manifest default: dropped with the old bot, not yet confirmed", false),
  shout_templates: { kind: "separate", note: "the shouts backfill script (window step 8)" },
  event_templates: dropped("docs/MIGRATION_EXPORTS.md, not exported on purpose: the one row is junk"),
  device_tokens: empty("empty in prod"),
  discord_guild_config: empty("empty in prod"),
  pot_distributions: empty("empty in prod, the finance mapper drops pot links because none are loaded"),
  verification_tokens: empty("empty in prod"),
  webhooks: empty("empty in prod, webhooks are retired"),
  _prisma_migrations: { kind: "ignored", note: "Prisma's own bookkeeping" },
}

export type Status = "carried" | "not migrated" | "to confirm" | "separate" | "ignored" | "PROBLEM"

export interface TableLine {
  table: string
  rows: number
  status: Status
  detail: string
}

function arrayAt(exports: ExportFiles, source: string): unknown[] | undefined {
  const dot = source.indexOf(".")
  const value = exports[source.slice(0, dot)]?.[source.slice(dot + 1)]
  return Array.isArray(value) ? value : undefined
}

function nestedTotal(rows: unknown[], field: string): number {
  return rows.reduce<number>((sum, row) => {
    const inner = (row as Row)[field]
    return sum + (Array.isArray(inner) ? inner.length : 0)
  }, 0)
}

// `after` is a second count taken once the exports finish. On a live database the export can land anywhere between the two,
// so an export count inside [min, max] is accepted; inside the maintenance window both are the same and it must be exact.
export function checkTables(counts: Counts, exports: ExportFiles, after?: Counts): TableLine[] {
  const lines: TableLine[] = []
  for (const [table, rows] of Object.entries(counts.tables).sort(([a], [b]) => a.localeCompare(b))) {
    const spec = TABLES[table]
    const afterRows = after?.tables[table] ?? rows
    const low = Math.min(rows, afterRows)
    const high = Math.max(rows, afterRows)
    const line = (status: Status, detail: string): TableLine => ({ table, rows, status, detail })
    const inRange = (n: number) => n >= low && n <= high
    const holds = (n: number) => `export holds ${n}, prod has ${low === high ? rows : `${low} to ${high}`}`

    if (!spec) {
      lines.push(line("PROBLEM", "table is not classified: add it to TABLES with a decision"))
      continue
    }
    switch (spec.kind) {
      case "exported": {
        const arr = arrayAt(exports, spec.source)
        if (!arr) lines.push(line("PROBLEM", `export ${spec.source} is missing`))
        else if (!inRange(arr.length)) lines.push(line("PROBLEM", holds(arr.length)))
        else lines.push(line("carried", `${arr.length} in ${spec.source}`))
        break
      }
      case "nested": {
        const arr = arrayAt(exports, spec.source)
        if (!arr) lines.push(line("PROBLEM", `export ${spec.source} is missing`))
        else {
          const n = nestedTotal(arr, spec.field)
          if (!inRange(n)) lines.push(line("PROBLEM", `${holds(n)} (counted in ${spec.source}[].${spec.field})`))
          else lines.push(line("carried", `${n} in ${spec.source}[].${spec.field}`))
        }
        break
      }
      case "folded": {
        const m = counts.metrics?.[spec.metric]
        if (m === undefined) lines.push(line("PROBLEM", `metric ${spec.metric} is missing from the counts file`))
        else if (m > 0) lines.push(line("PROBLEM", `${m} rows are not carried into ${spec.into}`))
        else lines.push(line("carried", `folded into ${spec.into}, none left out`))
        break
      }
      case "filtered": {
        const m = counts.metrics?.[spec.metric]
        const arr = arrayAt(exports, spec.source)
        if (m === undefined) lines.push(line("PROBLEM", `metric ${spec.metric} is missing from the counts file`))
        else if (m > 0) lines.push(line("PROBLEM", `${m} rows are excluded by the filter ${spec.filter}`))
        else if (!arr) lines.push(line("PROBLEM", `export ${spec.source} is missing`))
        else if (!inRange(arr.length)) lines.push(line("PROBLEM", holds(arr.length)))
        else lines.push(line("carried", `${arr.length} in ${spec.source}, the filter excludes none`))
        break
      }
      case "not_migrated":
        lines.push(line(spec.confirmed ? "not migrated" : "to confirm", spec.decision))
        break
      case "separate":
        lines.push(line("separate", spec.note))
        break
      case "expect_empty":
        lines.push(
          rows > 0 ? line("PROBLEM", `expected empty (${spec.note}) but has ${rows} rows`) : line("ignored", spec.note)
        )
        break
      case "ignored":
        lines.push(line("ignored", spec.note))
        break
      case "undecided":
        lines.push(
          rows > 0
            ? line("PROBLEM", `${rows === 1 ? "1 row" : `${rows} rows`}, ${spec.note}`)
            : line("ignored", `empty, ${spec.note}`)
        )
        break
    }
  }
  return lines
}

export interface Relation {
  id: string
  exportSource: string
  mappedFile: string
  array: string
}

// Arrays whose mapper accounts for every input row: each row is either pushed to the output or skipped by its id, never
// neither. Checked by reading each loop, not assumed. The other mapped arrays are not strict yet; add them once their
// residual has been seen on a rehearsal.
export const STRICT_RELATIONS: Relation[] = [
  { id: "characters", exportSource: "characters.characters", mappedFile: "characters", array: "characters" },
  { id: "patrons", exportSource: "patrons.patrons", mappedFile: "patrons", array: "patrons" },
  { id: "patron logs", exportSource: "patrons.logs", mappedFile: "patrons", array: "logs" },
  { id: "transactions", exportSource: "finance.transactions", mappedFile: "finance", array: "transactions" },
  { id: "payroll", exportSource: "finance.payroll", mappedFile: "finance", array: "payroll" },
  { id: "follows", exportSource: "follows-feedback.follows", mappedFile: "follows-feedback", array: "follows" },
  { id: "feedback", exportSource: "follows-feedback.feedback", mappedFile: "follows-feedback", array: "feedback" },
  { id: "tasks", exportSource: "tasks-rooms.tasks", mappedFile: "tasks-rooms", array: "tasks" },
  { id: "rooms", exportSource: "tasks-rooms.rooms", mappedFile: "tasks-rooms", array: "rooms" },
]

export interface RelationLine {
  id: string
  input: number
  output: number
  skipped: number
  vanished: number
  extra: number
}

export function checkRelations(
  exports: ExportFiles,
  mapped: MappedFiles
): { lines: RelationLine[]; problems: string[] } {
  const lines: RelationLine[] = []
  const problems: string[] = []
  for (const rel of STRICT_RELATIONS) {
    const input = arrayAt(exports, rel.exportSource)
    const file = mapped[rel.mappedFile]
    if (!input) {
      problems.push(`${rel.id}: export ${rel.exportSource} is missing`)
      continue
    }
    const output = file?.[rel.array]
    if (!file || !Array.isArray(output)) {
      problems.push(`${rel.id}: ${rel.mappedFile}-mapped.json has no ${rel.array} list`)
      continue
    }
    const ids = new Set(input.map((r) => String((r as Row).id)))
    const skippedKeys = new Set<string>()
    for (const s of Array.isArray(file.skipped) ? (file.skipped as Row[]) : []) {
      const key = String(s.key)
      if (ids.has(key)) skippedKeys.add(key)
    }
    const gap = input.length - output.length - skippedKeys.size
    const line = {
      id: rel.id,
      input: input.length,
      output: output.length,
      skipped: skippedKeys.size,
      vanished: Math.max(gap, 0),
      extra: Math.max(-gap, 0),
    }
    lines.push(line)
    if (line.vanished > 0)
      problems.push(`${rel.id}: ${line.vanished} input rows are neither in the output nor in skipped`)
  }
  return { lines, problems }
}

export type SkipCategory = "decided" | "duplicate" | "data"

export interface SkipRule {
  id: string
  test: RegExp
  category: SkipCategory
}

// Every way a mapper can skip a row, from the skip(...) calls in lib/migration. "decided" rows are left out on purpose,
// "duplicate" rows repeat one that is kept, and "data" rows are real rows lost to bad data and need a person to look.
export const SKIP_RULES: SkipRule[] = [
  { id: "test-venue", test: /^test venue, left out by decision$/, category: "decided" },
  { id: "empty-venue", test: /^no owner and nothing in it$/, category: "decided" },
  { id: "feedback-excluded", test: /^excluded by decision$/, category: "decided" },
  { id: "hours-from-ffxivvenues", test: /^this venue's hours come from ffxivvenues\.com$/, category: "decided" },
  { id: "duplicate-name", test: /^same .+ as an earlier .+, ignoring case$/, category: "duplicate" },
  { id: "duplicate-follow", test: /^second follow of the same venue by the same person$/, category: "duplicate" },
  { id: "duplicate-membership", test: /^second membership for the same person at this venue$/, category: "duplicate" },
  { id: "duplicate-settings", test: /^second (pot|inventory) settings row for the same venue$/, category: "duplicate" },
  { id: "person-not-loaded", test: /^person not loaded$/, category: "data" },
  { id: "membership-not-loaded", test: /^membership was not loaded$/, category: "data" },
  {
    id: "position-not-loaded",
    test: /^position was not loaded$|^position belongs to another venue$/,
    category: "data",
  },
  { id: "shift-not-loaded", test: /^its shift was not loaded$/, category: "data" },
  {
    id: "parent-missing",
    test: /^parent event not found$|^belongs to a series that was not mapped$/,
    category: "data",
  },
  { id: "blank", test: /^blank (name|title|subject)( or world)?$/, category: "data" },
  {
    id: "too-long",
    test: /(over \d+ characters|is blank or over 100 characters|too long or already used)$/,
    category: "data",
  },
  {
    id: "bad-amount",
    test: /^amount is not positive$|^negative price$|^paid hourly entry with a total of 0$/,
    category: "data",
  },
  { id: "no-payee", test: /^no membership and no payee name$/, category: "data" },
  { id: "unknown-value", test: /^unknown (category|status|action|audit action|recurrence) /, category: "data" },
  { id: "nothing-to-carry", test: /^no character and (a count of 0, it carries nothing|no count)$/, category: "data" },
  { id: "pending-invite", test: /^pending invite$|^status .*, needs a decision$|^no user$/, category: "data" },
  {
    id: "hours-invalid",
    test: /^day or start time out of range$|^length is not between a minute and a day$|^monthly entry without a week of the month$/,
    category: "data",
  },
  { id: "tax-range", test: /^tax of .*% is outside 0 to 100$/, category: "data" },
  { id: "unreferenced", test: /^unreferenced$/, category: "data" },
  { id: "stock-no-item", test: /^stock count without a linked item/, category: "data" },
  {
    id: "empty-shift",
    test: /^open slot with no event or position$|^not worked, and no event or position to seat it on$/,
    category: "data",
  },
]

export function classifySkip(reason: string): SkipRule {
  return SKIP_RULES.find((r) => r.test.test(reason)) ?? { id: "unclassified", test: /.*/, category: "data" }
}

export interface SkipLine {
  file: string
  rule: string
  category: SkipCategory
  count: number
  samples: string[]
}

export function collectSkips(mapped: MappedFiles): SkipLine[] {
  const groups = new Map<string, SkipLine>()
  for (const [file, content] of Object.entries(mapped)) {
    for (const s of Array.isArray(content?.skipped) ? (content.skipped as Row[]) : []) {
      const reason = String(s.reason)
      const rule = classifySkip(reason)
      const key = `${file}:${rule.id}`
      const line = groups.get(key) ?? { file, rule: rule.id, category: rule.category, count: 0, samples: [] }
      line.count++
      if (line.samples.length < 2 && !line.samples.includes(reason)) line.samples.push(reason)
      groups.set(key, line)
    }
  }
  return [...groups.values()].sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule))
}

export interface PrepareLine {
  file: string
  array: string
  mapped: number
  prepared: number
  venueLeftOut: number
  cascade: number
}

export function checkPrepare(mapped: MappedFiles, prepared: MappedFiles): { lines: PrepareLine[]; problems: string[] } {
  const lines: PrepareLine[] = []
  const problems: string[] = []
  const venues = prepared.venues?.venues
  const allowed = new Set(Array.isArray(venues) ? (venues as Row[]).map((v) => String(v.key)) : [])
  for (const [file, arrays] of Object.entries(LOAD_ARRAYS)) {
    if (!mapped[file]) continue
    if (!prepared[file]) {
      problems.push(`${file}-prepared.json is missing`)
      continue
    }
    for (const array of arrays) {
      const before = (mapped[file]?.[array] as Row[] | undefined) ?? []
      const after = (prepared[file]?.[array] as Row[] | undefined) ?? []
      const venueLeftOut = before.filter((r) => "venue_key" in r && !allowed.has(String(r.venue_key))).length
      const cascade = before.length - after.length - venueLeftOut
      if (cascade < 0) problems.push(`${file}.${array}: prepared has ${-cascade} more rows than mapped`)
      if (before.length !== after.length)
        lines.push({
          file,
          array,
          mapped: before.length,
          prepared: after.length,
          venueLeftOut,
          cascade: Math.max(cascade, 0),
        })
    }
  }
  return { lines, problems }
}

export interface Report {
  tables: TableLine[]
  relations: RelationLine[]
  skips: SkipLine[]
  prepare: PrepareLine[]
  problems: string[]
}

export interface ReportInput {
  counts: Counts
  countsAfter?: Counts
  exports: ExportFiles
  mapped: MappedFiles
  prepared: MappedFiles
  // Rows a person has looked at and accepted losing, by "<file>:<rule>" or "<file>.<array>:cascade", as the most allowed.
  accepted?: Record<string, number>
}

export function buildReport(input: ReportInput): Report {
  const accepted = input.accepted ?? {}
  const problems: string[] = []

  const tables = checkTables(input.counts, input.exports, input.countsAfter)
  for (const t of tables)
    if (t.status === "PROBLEM")
      problems.push(`table ${t.table} (${t.rows === 1 ? "1 row" : `${t.rows} rows`}): ${t.detail}`)

  const { lines: relations, problems: relationProblems } = checkRelations(input.exports, input.mapped)
  problems.push(...relationProblems)

  const skips = collectSkips(input.mapped)
  for (const s of skips) {
    if (s.category !== "data") continue
    const allowed = accepted[`${s.file}:${s.rule}`] ?? 0
    if (s.count > allowed)
      problems.push(`${s.file}: ${s.count} rows skipped as "${s.rule}" (accepted ${allowed}), e.g. ${s.samples[0]}`)
  }

  const { lines: prepare, problems: prepareProblems } = checkPrepare(input.mapped, input.prepared)
  problems.push(...prepareProblems)
  for (const p of prepare) {
    const allowed = accepted[`${p.file}.${p.array}:cascade`] ?? 0
    if (p.cascade > allowed)
      problems.push(
        `${p.file}.${p.array}: ${p.cascade} rows dropped because their parent was not loaded (accepted ${allowed})`
      )
  }

  return { tables, relations, skips, prepare, problems }
}

const pad = (value: string | number, width: number) => String(value).padEnd(width)

export function renderReport(report: Report): string {
  const out: string[] = []
  const total = report.tables.reduce((n, t) => n + t.rows, 0)
  const by = (s: Status) => report.tables.filter((t) => t.status === s)
  out.push(`Conservation report: ${report.tables.length} tables, ${total} rows in prod`)
  out.push("")
  out.push("1. Prod to export (every table, by name)")
  for (const t of report.tables) out.push(`   ${pad(t.status, 12)} ${pad(t.table, 30)} ${pad(t.rows, 7)} ${t.detail}`)
  const carried = by("carried").reduce((n, t) => n + t.rows, 0)
  const notMigrated = [...by("not migrated"), ...by("to confirm")].reduce((n, t) => n + t.rows, 0)
  out.push(
    `   carried ${carried} rows, deliberately not migrated ${notMigrated} rows, ${by("to confirm").length} tables still to confirm`
  )
  out.push("")
  out.push("2. Export to mapped (strict: input = output + skipped; rows that vanish fail)")
  for (const r of report.relations)
    out.push(
      `   ${pad(r.id, 14)} in ${pad(r.input, 7)} out ${pad(r.output, 7)} skipped ${pad(r.skipped, 5)} vanished ${r.vanished}${r.extra ? `  (+${r.extra} created)` : ""}`
    )
  out.push("")
  out.push("3. Rows the mappers skipped, by reason")
  if (report.skips.length === 0) out.push("   none")
  for (const s of report.skips)
    out.push(`   ${pad(s.category, 10)} ${pad(s.file, 17)} ${pad(s.rule, 24)} ${pad(s.count, 6)} e.g. ${s.samples[0]}`)
  out.push("")
  out.push("4. Rows prepare-load dropped")
  if (report.prepare.length === 0) out.push("   none")
  for (const p of report.prepare)
    out.push(
      `   ${pad(`${p.file}.${p.array}`, 32)} ${p.mapped} to ${p.prepared}: ${p.venueLeftOut} in venues left out, ${p.cascade} children of a skipped parent`
    )
  out.push("")
  out.push(
    "Not covered here: the loader's own drops (rows whose parent did not load). Read its dry-run report for those."
  )
  out.push("")
  out.push(
    report.problems.length === 0
      ? "RESULT: every row is accounted for"
      : `RESULT: ${report.problems.length} problem${report.problems.length === 1 ? "" : "s"}`
  )
  for (const p of report.problems) out.push(`   - ${p}`)
  return out.join("\n")
}
