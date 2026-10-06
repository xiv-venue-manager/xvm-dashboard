import type { ShoutRow } from "@/lib/api/xvm-api"

export interface ShoutShape {
  id: string
  label: string
  fields: Record<string, unknown>
  templateId: string
  separatorId: string
  decorId: string
  createdAt: string
}

export function toShoutShape(row: ShoutRow): ShoutShape {
  return {
    id: String(row.id),
    label: row.label,
    fields: row.fields,
    templateId: row.template_id,
    separatorId: row.separator_id,
    decorId: row.decor_id,
    createdAt: row.created_at,
  }
}
