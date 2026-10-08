import type { ShoutFields, TemplateId } from "../types"
import type { SeparatorId, DecorId } from "./shout-templates"

const API = "https://xivvenuemanager.com/api/shout-crafter/shouts"

export interface SavedShout {
  id: string
  label: string
  fields: ShoutFields
  templateId: TemplateId
  separatorId: SeparatorId
  decorId: DecorId
  createdAt: string
}

export type FetchShoutsResult =
  | { ok: true; shouts: SavedShout[] }
  | { ok: false; reason: "signed_out" | "unavailable" }

export async function fetchShouts(): Promise<FetchShoutsResult> {
  try {
    const res = await fetch(API, { credentials: "include" })
    if (res.status === 401) return { ok: false, reason: "signed_out" }
    if (!res.ok) return { ok: false, reason: "unavailable" }
    const body: unknown = await res.json()
    if (!Array.isArray(body)) return { ok: false, reason: "unavailable" }
    return { ok: true, shouts: body as SavedShout[] }
  } catch {
    return { ok: false, reason: "unavailable" }
  }
}

export async function saveShout(data: Omit<SavedShout, "id" | "createdAt">): Promise<SavedShout | null> {
  const res = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteShout(id: string): Promise<boolean> {
  const res = await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" })
  return res.ok
}
