export interface ExportedFollow {
  id: string
  userId: string
  venueId: string
  visibleToOperators: boolean
  createdAt: string
}

export interface ExportedFeedback {
  id: string
  userId: string
  category: string
  status: string
  subject: string
  description: string
  url: string | null
  userAgent: string | null
  screenshot: string | null
  adminNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FollowsFeedbackExport {
  follows: ExportedFollow[]
  feedback: ExportedFeedback[]
}

export interface FollowsFeedbackContext {
  personKeys: ReadonlySet<string>
  excludeFeedback: ReadonlySet<string>
}

export interface FollowRow {
  key: string
  venue_key: string
  person_key: string
  visible_to_operators: boolean
  created_at: string
}

export interface FeedbackRow {
  key: string
  person_key: string
  category: "bug_report" | "feature_request" | "improvement" | "general"
  status: "new" | "under_review" | "planned" | "in_progress" | "completed" | "wont_fix"
  subject: string
  description: string
  url: string | null
  user_agent: string | null
  admin_notes: string | null
  reviewed_by_person_key: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface FollowsFeedbackResult {
  follows: FollowRow[]
  feedback: FeedbackRow[]
  suggestedDrops: { key: string; reason: string }[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const CATEGORIES = new Set(["bug_report", "feature_request", "improvement", "general"])
const STATUSES = new Set(["new", "under_review", "planned", "in_progress", "completed", "wont_fix"])
const CLOSED = new Set(["completed", "wont_fix"])
const MAX_SUBJECT = 200
const MAX_URL = 500
const MAX_AGENT = 300

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

function looksLikeATestOrAMessage(subject: string, category: string): string | null {
  const s = subject.toLowerCase()
  if (/\b(test|testing|qa)\b/.test(s)) return "subject says it is a test"
  if (/^hello\b/.test(s)) return "subject is a greeting"
  if (s === "ehno") return "subject is only a name"
  if (s.replace(/[^a-z]/g, "") === category.replace(/[^a-z]/g, "")) return "subject is only the category"
  return null
}

export function mapFollowsFeedback(source: FollowsFeedbackExport, ctx: FollowsFeedbackContext): FollowsFeedbackResult {
  const result: FollowsFeedbackResult = { follows: [], feedback: [], suggestedDrops: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const taken = new Set<string>()
  for (const f of [...source.follows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (!ctx.personKeys.has(f.userId)) {
      skip(f.id, "person not loaded")
      continue
    }
    const identity = `${f.userId}|${f.venueId}`
    if (taken.has(identity)) {
      skip(f.id, "second follow of the same venue by the same person")
      continue
    }
    taken.add(identity)
    result.follows.push({
      key: f.id,
      venue_key: f.venueId,
      person_key: f.userId,
      visible_to_operators: f.visibleToOperators,
      created_at: f.createdAt,
    })
  }

  let screenshots = 0
  for (const f of [...source.feedback].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const category = f.category.toLowerCase()
    const status = f.status.toLowerCase()
    if (!CATEGORIES.has(category)) {
      skip(f.id, `unknown category ${JSON.stringify(f.category)}`)
      continue
    }
    if (!STATUSES.has(status)) {
      skip(f.id, `unknown status ${JSON.stringify(f.status)}`)
      continue
    }
    if (!ctx.personKeys.has(f.userId)) {
      skip(f.id, "person not loaded")
      continue
    }

    const subject = squash(f.subject)
    if (CLOSED.has(status)) {
      const why = looksLikeATestOrAMessage(subject, category)
      if (why) result.suggestedDrops.push({ key: f.id, reason: why })
    }
    if (ctx.excludeFeedback.has(f.id)) {
      skip(f.id, "excluded by decision")
      continue
    }
    if (!subject) {
      skip(f.id, "blank subject")
      continue
    }
    if (subject.length > MAX_SUBJECT) {
      skip(f.id, `subject over ${MAX_SUBJECT} characters`)
      continue
    }
    if (f.screenshot !== null) screenshots++

    let url = f.url === null ? null : f.url.trim() || null
    if (url !== null && url.length > MAX_URL) {
      url = url.slice(0, MAX_URL)
      warn(f.id, `url cut to ${MAX_URL} characters`)
    }
    let userAgent = f.userAgent === null ? null : f.userAgent.trim() || null
    if (userAgent !== null && userAgent.length > MAX_AGENT) {
      userAgent = userAgent.slice(0, MAX_AGENT)
      warn(f.id, `user agent cut to ${MAX_AGENT} characters`)
    }

    result.feedback.push({
      key: f.id,
      person_key: f.userId,
      category: category as FeedbackRow["category"],
      status: status as FeedbackRow["status"],
      subject,
      description: f.description,
      url,
      user_agent: userAgent,
      admin_notes: f.adminNotes === null ? null : f.adminNotes.trim() || null,
      reviewed_by_person_key: f.reviewedBy !== null && ctx.personKeys.has(f.reviewedBy) ? f.reviewedBy : null,
      reviewed_at: f.reviewedAt,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
    })
  }

  if (screenshots > 0) warn("feedback", `${screenshots} screenshot links not migrated, xvm-api keeps screenshots as stored files`)
  return result
}
