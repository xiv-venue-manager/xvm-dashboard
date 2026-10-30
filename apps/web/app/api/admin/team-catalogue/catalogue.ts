import { z } from "zod"
import type { TeamCatalogueKind } from "@/lib/api/xvm-api"

export type CatalogueContext = { params: Promise<{ kind: string }> }

export function parseKind(value: string): TeamCatalogueKind | null {
  return value === "roles" || value === "groups" ? value : null
}

export function catalogueNameSchema(kind: TeamCatalogueKind) {
  return z.object({ name: z.string().trim().min(1).max(kind === "roles" ? 80 : 40) }).strict()
}
