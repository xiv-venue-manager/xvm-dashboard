// A Frogge server becomes an XVM venue when it holds real venue data. These are the tables that count. A table every
// server gets by default (leveling and quote board settings, finance templates, audit log settings), one that is not
// venue data (welcome posts, plugin sync, verification records, admin users, auto roles) and a single character
// profile or message template do not.
export const SCOPE_TABLES = [
  "positions",
  "staff_members",
  "staff_member_positions",
  "events",
  "event_positions",
  "event_shifts",
  "event_templates",
  "event_recurrence_rules",
  "forms",
  "giveaways",
  "raffles",
  "leveling_members",
  "rooms",
  "reaction_role_panels",
  "sticky_messages",
  "tracked_streams",
  "vip_tiers",
  "vip_members",
  "vip_memberships",
  "custom_embeds",
  "auto_reactor_rules",
  "venue_links",
  "finance_transactions",
] as const

export type OwnerStatus = Record<string, string>

export interface ScopeServer {
  guildId: string
  tables: Record<string, number>
}

export interface ScopeResult {
  include: ScopeServer[]
  needsOwnerLookup: string[]
  botGone: ScopeServer[]
  leftOut: number
  added: string[]
  dropped: string[]
}

export function parseActivity(text: string): Map<string, Record<string, number>> {
  const byGuild = new Map<string, Record<string, number>>()
  for (const line of text.split("\n")) {
    const [table, guildId, rows] = line.trim().split("|")
    if (!table || !guildId || rows === undefined) continue
    byGuild.set(guildId, { ...byGuild.get(guildId), [table]: Number(rows) })
  }
  return byGuild
}

export function frogScope(
  activity: Map<string, Record<string, number>>,
  owners: OwnerStatus,
  current: ReadonlySet<string>
): ScopeResult {
  const include: ScopeServer[] = []
  const botGone: ScopeServer[] = []
  let leftOut = 0
  for (const [guildId, all] of [...activity.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const tables = Object.fromEntries(SCOPE_TABLES.filter((t) => (all[t] ?? 0) > 0).map((t) => [t, all[t]]))
    if (Object.keys(tables).length === 0) {
      leftOut++
      continue
    }
    if (owners[guildId] !== undefined && owners[guildId] !== "ok") botGone.push({ guildId, tables })
    else include.push({ guildId, tables })
  }
  const unreachable = (guildId: string) => owners[guildId] !== undefined && owners[guildId] !== "ok"
  for (const guildId of current) {
    if (unreachable(guildId) && !botGone.some((s) => s.guildId === guildId)) botGone.push({ guildId, tables: {} })
  }
  const chosen = new Set(include.map((s) => s.guildId))
  return {
    include,
    needsOwnerLookup: include.filter((s) => owners[s.guildId] === undefined).map((s) => s.guildId),
    botGone,
    leftOut,
    added: [...chosen].filter((g) => !current.has(g)),
    dropped: [...current].filter((g) => !chosen.has(g) && !unreachable(g)),
  }
}

export function renderScope(result: ScopeResult): string {
  const lines = [
    `Servers to load: ${result.include.length}`,
    `Servers with data but no owner the bot can reach (skipped, Allegro 2026-11-03): ${result.botGone.length}`,
    `Servers with no venue data: ${result.leftOut}`,
    "",
    `Not in the current export list and now qualifying: ${result.added.length}`,
    ...result.added.map(
      (g) =>
        `   + ${g}  ${Object.entries(result.include.find((s) => s.guildId === g)!.tables)
          .map(([t, n]) => `${t} ${n}`)
          .join(", ")}`
    ),
    `On the current list but with no venue data by the rule, kept for review: ${result.dropped.length}`,
    ...result.dropped.map((g) => `   - ${g}`),
    "",
    `Owner lookup still needed for ${result.needsOwnerLookup.length} server(s): run frogge-owners.sh with these ids before loading.`,
  ]
  return lines.join("\n")
}
