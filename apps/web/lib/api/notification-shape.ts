import type { NotificationKind, NotificationRow } from "@/lib/api/xvm-api"

export interface BellNotification {
  id: string
  type: NotificationKind
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

const VENUE_SECTION: Partial<Record<NotificationKind, string>> = {
  "follower.new": "analytics",
  "staff.joined": "staff",
  "task.assigned": "tasks",
  "task.completed": "tasks",
  "shift.reminder": "shifts",
  "shift.claim_submitted": "shifts",
  "shift.claim_approved": "shifts",
  "shift.claim_rejected": "shifts",
}

const SITE_ORIGIN = "https://site.invalid"

function isSitePath(link: string): boolean {
  if (!link.startsWith("/")) return false
  try {
    return new URL(link, SITE_ORIGIN).origin === SITE_ORIGIN
  } catch {
    return false
  }
}

export function notificationLink(row: Pick<NotificationRow, "kind" | "link" | "venue_slug">): string | null {
  if (row.link && isSitePath(row.link)) return row.link
  const section = VENUE_SECTION[row.kind]
  return section && row.venue_slug ? `/dashboard/${row.venue_slug}/${section}` : null
}

export function toBellNotification(row: NotificationRow): BellNotification {
  return {
    id: String(row.id),
    type: row.kind,
    title: row.title,
    body: row.body,
    link: notificationLink(row),
    read: row.read_at !== null,
    createdAt: row.created_at,
  }
}
