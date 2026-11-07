import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  TABLES,
  SKIP_RULES,
  STRICT_RELATIONS,
  buildReport,
  checkTables,
  classifySkip,
  renderReport,
  type Counts,
  type ExportFiles,
} from "./conservation"

// The row counts of prod's venue_manager database on 2026-11-07, from scripts/export/table-counts.sql. Table names and numbers only.
const PROD: Record<string, number> = {
  _RoleToService: 400,
  accounts: 278,
  announcement_dismissals: 24,
  announcements: 1,
  api_keys: 163,
  device_tokens: 0,
  discord_gil_reaction_rewards: 1,
  discord_guild_config: 0,
  discord_members: 86,
  discord_open_venues: 11,
  discord_tracked_messages: 9,
  discord_warn_logs: 1,
  event_templates: 1,
  events: 680,
  feedback: 44,
  membership_role_assignments: 78,
  memberships: 262,
  notification_preferences: 1,
  notifications: 304,
  patron_logs: 13090,
  patrons: 838,
  payroll_entries: 339,
  pending_notifications: 2594,
  pot_distributions: 0,
  refresh_tokens: 59,
  roles: 238,
  rooms: 36,
  services: 168,
  sessions: 1,
  shift_audit_logs: 1043,
  shift_signup_embeds: 27,
  shifts: 1299,
  shout_templates: 4,
  tasks: 32,
  transactions: 126,
  user_characters: 157,
  users: 280,
  venue_follows: 88,
  venue_inventory_settings: 24,
  venue_pot_settings: 24,
  venue_schedule_entries: 32,
  venue_schedules: 5,
  venues: 77,
  verification_tokens: 0,
  webhooks: 0,
}
const counts = (
  over: Partial<Record<string, number>> = {},
  metrics = { accounts_not_carried: 0, venue_schedules_not_ffxivvenues: 0 }
): Counts => ({
  tables: { ...PROD, ...over } as Record<string, number>,
  metrics,
})

// Exports that match the counts exactly, built from the same table list the report checks. Nested lists are filled into the
// rows of the array that carries them, which is also how the real export is shaped.
function exportsFor(c: Counts): ExportFiles {
  const files: ExportFiles = {}
  const place = (source: string) => {
    const dot = source.indexOf(".")
    return { file: source.slice(0, dot), key: source.slice(dot + 1) }
  }
  for (const [table, spec] of Object.entries(TABLES)) {
    if (spec.kind !== "exported" && spec.kind !== "filtered") continue
    const { file, key } = place(spec.source)
    files[file] ??= {}
    files[file]![key] = Array.from({ length: c.tables[table] ?? 0 }, (_, i) => ({ id: `${table}-${i}` }))
  }
  for (const [table, spec] of Object.entries(TABLES)) {
    if (spec.kind !== "nested") continue
    const { file, key } = place(spec.source)
    const rows = files[file]![key] as Record<string, unknown>[]
    for (const row of rows) row[spec.field] = []
    for (let i = 0; i < (c.tables[table] ?? 0); i++) (rows[i % rows.length][spec.field] as number[]).push(i)
  }
  return files
}

const noMapped = { mapped: {}, prepared: {} }
const problemsOf = (c: Counts, e: ExportFiles) =>
  buildReport({ counts: c, exports: e, ...noMapped }).problems.filter((p) => p.startsWith("table "))

describe("the table classification", () => {
  it("covers every table prod has, so none is silently ignored", () => {
    const unclassified = Object.keys(PROD).filter((t) => !(t in TABLES))
    expect(unclassified).toEqual([])
  })

  it("has no table without a decision today", () => {
    const c = counts()
    expect(problemsOf(c, exportsFor(c))).toEqual([])
    expect(Object.entries(TABLES).filter(([, d]) => d.kind === "undecided")).toEqual([])
  })

  it("fails a table marked undecided while it has rows, and lets it go once empty", () => {
    const original = TABLES.event_templates
    TABLES.event_templates = { kind: "undecided", note: "waiting on a decision" }
    try {
      const c = counts()
      expect(problemsOf(c, exportsFor(c))).toEqual([expect.stringContaining("event_templates")])
      const empty = counts({ event_templates: 0 })
      expect(problemsOf(empty, exportsFor(empty))).toEqual([])
    } finally {
      TABLES.event_templates = original
    }
  })

  it("fails a table it has never seen", () => {
    const c = counts({ brand_new_table: 3 })
    expect(problemsOf(c, exportsFor(c))).toContainEqual(expect.stringContaining("brand_new_table"))
  })
})

describe("prod to export", () => {
  const c = counts()

  it("passes when every export holds exactly what prod holds", () => {
    expect(problemsOf(c, exportsFor(c))).toEqual([])
  })

  it("fails when an export is one row short", () => {
    const e = exportsFor(c)
    ;(e.finance!.transactions as unknown[]).pop()
    expect(problemsOf(c, e)).toEqual([expect.stringMatching(/transactions.*export holds 125, prod has 126/)])
  })

  it("fails when an export file is missing", () => {
    const e = exportsFor(c)
    delete e.patrons
    expect(problemsOf(c, e).length).toBe(2)
    expect(problemsOf(c, e)).toContainEqual(expect.stringContaining("patrons.patrons is missing"))
  })

  it("counts rows nested inside another export", () => {
    const e = exportsFor(c)
    const rows = e.positions!.memberships as { additionalRoleIds: number[] }[]
    rows[0].additionalRoleIds.pop()
    expect(problemsOf(c, e)).toEqual([expect.stringMatching(/membership_role_assignments.*export holds 77/)])
  })

  it("accepts a count that falls between two counts taken around a live export", () => {
    const before = counts()
    const after = counts({ patron_logs: before.tables.patron_logs + 4 })
    const e = exportsFor(before)
    ;(e.patrons!.logs as unknown[]).push({ id: "x" }, { id: "y" })
    const lines = checkTables(before, e, after)
    expect(lines.find((l) => l.table === "patron_logs")?.status).toBe("carried")
    ;(e.patrons!.logs as unknown[]).push({ id: "z" }, { id: "w" }, { id: "v" })
    expect(checkTables(before, e, after).find((l) => l.table === "patron_logs")?.status).toBe("PROBLEM")
  })

  it("fails when a filter would have excluded rows, or a folded table has rows left behind", () => {
    const filtered = counts({}, { accounts_not_carried: 0, venue_schedules_not_ffxivvenues: 2 })
    expect(problemsOf(filtered, exportsFor(filtered))).toEqual([
      expect.stringMatching(/venue_schedules.*2 rows are excluded/),
    ])
    const folded = counts({}, { accounts_not_carried: 5, venue_schedules_not_ffxivvenues: 0 })
    expect(problemsOf(folded, exportsFor(folded))).toEqual([expect.stringMatching(/accounts.*5 rows are not carried/)])
  })

  it("fails a table that should be empty but has rows, and flags unconfirmed drops without failing", () => {
    const grown = counts({ webhooks: 2 })
    expect(problemsOf(grown, exportsFor(grown))).toEqual([expect.stringMatching(/webhooks.*expected empty/)])
    const lines = checkTables(c, exportsFor(c))
    expect(lines.find((l) => l.table === "discord_open_venues")?.status).toBe("to confirm")
    expect(lines.find((l) => l.table === "api_keys")?.status).toBe("not migrated")
  })
})

describe("export to mapped", () => {
  const c = counts()
  const base = () => ({ counts: c, exports: exportsFor(c), prepared: {} })
  const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
  const mappedFor = (skipKeys: string[], extra = 0) => {
    const total = c.tables.user_characters
    return {
      characters: {
        characters: Array.from({ length: total - skipKeys.length + extra }, () => ({})),
        skipped: skipKeys.map((key) => ({ key, reason: "blank name or world" })),
      },
    }
  }

  it("passes when every input row is mapped or skipped", () => {
    const report = buildReport({ ...base(), mapped: mappedFor(ids(2, "user_characters")) })
    expect(report.relations.find((r) => r.id === "characters")).toMatchObject({ vanished: 0, skipped: 2 })
  })

  it("fails when a row is neither mapped nor skipped", () => {
    const m = mappedFor(ids(2, "user_characters"))
    m.characters.characters.pop()
    const report = buildReport({ ...base(), mapped: m })
    expect(report.problems).toContainEqual(expect.stringMatching(/characters: 1 input rows are neither/))
  })

  it("allows a mapper to create extra rows, and reports them", () => {
    const report = buildReport({ ...base(), mapped: mappedFor([], 3) })
    expect(report.relations.find((r) => r.id === "characters")).toMatchObject({ vanished: 0, extra: 3 })
    expect(report.problems.filter((p) => p.startsWith("characters"))).toEqual([])
  })

  it("ignores skipped entries that are not rows of that export", () => {
    const m = mappedFor(["unrelated-id"])
    expect(buildReport({ ...base(), mapped: m }).problems).toContainEqual(
      expect.stringMatching(/characters: 1 input rows are neither/)
    )
  })
})

describe("skipped rows", () => {
  const c = counts()
  const run = (skipped: { key: string; reason: string }[], accepted?: Record<string, number>) =>
    buildReport({
      counts: c,
      exports: exportsFor(c),
      mapped: { finance: { transactions: [], payroll: [], skipped } },
      prepared: { finance: { transactions: [], payroll: [] } },
      accepted,
    })

  it("lets decided and duplicate skips through, and still lists them", () => {
    const report = run([
      { key: "a", reason: "same name as an earlier room at this venue, ignoring case" },
      { key: "b", reason: "excluded by decision" },
    ])
    expect(report.skips.map((s) => [s.rule, s.category])).toEqual([
      ["duplicate-name", "duplicate"],
      ["feedback-excluded", "decided"],
    ])
    expect(report.problems.filter((p) => p.startsWith("finance"))).toEqual([])
  })

  it("fails data-quality skips until a person accepts that many", () => {
    const skipped = [
      { key: "a", reason: "amount is not positive" },
      { key: "b", reason: "amount is not positive" },
    ]
    expect(run(skipped).problems).toContainEqual(
      expect.stringMatching(/finance: 2 rows skipped as "bad-amount" \(accepted 0\)/)
    )
    expect(run(skipped, { "finance:bad-amount": 2 }).problems.filter((p) => p.startsWith("finance"))).toEqual([])
    expect(
      run([...skipped, { key: "c", reason: "amount is not positive" }], { "finance:bad-amount": 2 }).problems
    ).toContainEqual(expect.stringMatching(/3 rows skipped as "bad-amount" \(accepted 2\)/))
  })

  it("treats a reason nothing recognises as data loss to review", () => {
    expect(classifySkip("something the catalog has never seen")).toMatchObject({ id: "unclassified", category: "data" })
    expect(run([{ key: "a", reason: "something new" }]).problems).toContainEqual(
      expect.stringContaining("unclassified")
    )
  })
})

describe("every skip reason in the mappers", () => {
  const dir = __dirname
  const sources = readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "conservation.ts"
  )

  // Each skip(key, reason) call, with every string in its reason argument. A ternary gives two reasons, a template has its
  // ${...} parts replaced by 1. The reason argument starts after the first comma that is not inside brackets or a string.
  function calls(text: string): { reasons: string[] }[] {
    const found: { reasons: string[] }[] = []
    for (const m of text.matchAll(/\bskip\(/g)) {
      let depth = 1
      let quote = ""
      let firstComma = -1
      let i = m.index! + m[0].length
      const start = i
      for (; i < text.length && depth > 0; i++) {
        const ch = text[i]
        if (quote) {
          if (ch === "\\") i++
          else if (ch === quote) quote = ""
        } else if (ch === '"' || ch === "'" || ch === "`") quote = ch
        else if ("([{".includes(ch)) depth++
        else if (")]}".includes(ch)) depth--
        else if (ch === "," && depth === 1 && firstComma < 0) firstComma = i
      }
      const reasonArg = text.slice(firstComma + 1, i - 1)
      const reasons = [...reasonArg.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((r) =>
        r[2].replace(/\$\{[^}]*\}/g, "1")
      )
      found.push({ reasons })
      void start
    }
    return found
  }

  const all = sources.flatMap((file) => calls(readFileSync(join(dir, file), "utf8")).map((c) => ({ file, ...c })))

  it("finds every skip call, each with a reason it can read", () => {
    expect(all.length).toBeGreaterThan(55)
    expect(all.filter((c) => c.reasons.length === 0).map((c) => c.file)).toEqual([])
  })

  it("classifies each reason, so a new way to lose a row has to be decided", () => {
    const unclassified = all
      .flatMap((c) => c.reasons.map((reason) => ({ file: c.file, reason })))
      .filter((r) => classifySkip(r.reason).id === "unclassified")
    expect(unclassified).toEqual([])
  })

  it("keeps the strict relations pointing at real export arrays", () => {
    const exported = new Set(Object.values(TABLES).flatMap((d) => (d.kind === "exported" ? [d.source] : [])))
    for (const rel of STRICT_RELATIONS) expect(exported.has(rel.exportSource)).toBe(true)
    expect(SKIP_RULES.length).toBeGreaterThan(20)
  })
})

describe("the rendered report", () => {
  it("states the result and what it cannot cover", () => {
    const c = counts()
    const text = renderReport(buildReport({ counts: c, exports: exportsFor(c), mapped: {}, prepared: {} }))
    expect(text).toContain("Conservation report: 45 tables")
    expect(text).toContain("RESULT: ")
    expect(text).toContain("Not covered here: the loader")
    expect(text).toContain("event_templates")
  })
})
