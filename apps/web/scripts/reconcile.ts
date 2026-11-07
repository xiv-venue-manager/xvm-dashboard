/**
 * Checks that every key one prepared file points at exists in the file it belongs to. Run prepare-load.ts first.
 * Reads <name>-prepared.json, plus people-mapped.json and characters-mapped.json, from one directory.
 * Exits 1 when anything dangles.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/reconcile.ts <dir>
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import type { MappedFiles } from "../lib/migration/prepare-load"
import { checkReferences } from "../lib/migration/reconcile"

const [dir] = process.argv.slice(2)
if (!dir) {
  console.error("Usage: npx tsx scripts/reconcile.ts <dir>")
  process.exit(1)
}

const NAMES: [string, string][] = [
  ["people", "people-mapped.json"],
  ["characters", "characters-mapped.json"],
  ...["venues", "positions", "services", "events", "shifts", "finance", "patrons", "follows-feedback", "tasks-rooms", "hours", "settings"].map((n): [string, string] => [n, `${n}-prepared.json`]),
]
const files: MappedFiles = {}
for (const [name, file] of NAMES) {
  const path = join(dir, file)
  if (existsSync(path)) files[name] = JSON.parse(readFileSync(path, "utf8"))
}

const dangling = checkReferences(files)
for (const d of dangling) console.log(`  ${d.where}.${d.field}: ${d.count} point nowhere, e.g. ${d.sample}`)
console.log(dangling.length ? `${dangling.length} dangling references` : "every reference resolves")
process.exit(dangling.length ? 1 : 0)
