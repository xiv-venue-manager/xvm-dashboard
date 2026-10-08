import type { AdminFeedbackRow, FeedbackRow } from "@/lib/api/xvm-api"

export interface FeedbackShape {
  id: string
  category: string
  status: string
  subject: string
  description: string
  url: string | null
  userAgent: string | null
  adminNotes: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FeedbackPerson {
  id: string
  displayName: string
}

export interface AdminFeedbackShape extends FeedbackShape {
  user: FeedbackPerson
  reviewer: FeedbackPerson | null
}

export function toXvmFeedbackValue(value: string): string {
  return value.toLowerCase()
}

export function toFeedbackShape(row: FeedbackRow): FeedbackShape {
  return {
    id: String(row.id),
    category: row.category.toUpperCase(),
    status: row.status.toUpperCase(),
    subject: row.subject,
    description: row.description,
    url: row.url,
    userAgent: row.user_agent,
    adminNotes: row.admin_notes,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function person(id: number, displayName: string | null): FeedbackPerson {
  return { id: String(id), displayName: displayName ?? `Person #${id}` }
}

export function toAdminFeedbackShape(row: AdminFeedbackRow): AdminFeedbackShape {
  return {
    ...toFeedbackShape(row),
    user: person(row.person_id, row.person_display_name),
    reviewer:
      row.reviewed_by_person_id == null ? null : person(row.reviewed_by_person_id, row.reviewed_by_display_name),
  }
}
