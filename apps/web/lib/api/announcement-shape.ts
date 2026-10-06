import type { AnnouncementRow } from "@/lib/api/xvm-api"

export interface AnnouncementShape {
  id: string
  title: string
  message: string
  link: string | null
  linkLabel: string | null
  expiresAt: string | null
  createdAt: string
}

export function toAnnouncementShape(row: AnnouncementRow): AnnouncementShape {
  return {
    id: String(row.id),
    title: row.title,
    message: row.message,
    link: row.link,
    linkLabel: row.link_label,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}
