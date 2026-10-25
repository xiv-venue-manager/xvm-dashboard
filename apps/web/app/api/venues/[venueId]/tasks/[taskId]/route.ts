import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { parseId } from "@/lib/api/venue-action"
import {
  listTasks,
  updateTask,
  assignTask,
  startTask,
  completeTask,
  cancelTask,
  listPositions,
  listTaskCategories,
  listMemberships,
  XvmApiError,
  xvmErrorMessage,
  type TaskRow,
  type PositionRow,
  type MembershipRow,
} from "@/lib/api/xvm-api"
import { priorityToInt, intToPriority, resolveCategoryId } from "@/lib/api/task-convert"
import { validators } from "@/lib/validation"
import {
  sendDiscordWebhook,
  formatTaskCompletedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

const updateTaskSchema = z.object({
  title: validators.taskTitle.optional(),
  description: validators.taskDescription,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().nullable().optional(),
  assignedRoleId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

// Both null unassigns, matching xvm-api's TaskAssign contract.
const transitionSchema = z.object({
  action: z.enum(["start", "complete", "cancel"]),
  reason: z.string().optional(), // only meaningful for "cancel"
})

function deriveStatus(task: TaskRow): "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" {
  if (task.cancelled_at) return "CANCELLED"
  if (task.completed_at) return "COMPLETED"
  if (task.started_at) return "IN_PROGRESS"
  return "PENDING"
}

function toTaskShape(
  task: TaskRow,
  positionsById: Map<number, PositionRow>,
  membershipsById: Map<number, MembershipRow>,
  categoryName: string | null
) {
  const position = task.assigned_position_id ? positionsById.get(task.assigned_position_id) : null
  const membership = task.assigned_membership_id ? membershipsById.get(task.assigned_membership_id) : null
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: deriveStatus(task),
    priority: intToPriority(task.priority),
    category: categoryName,
    dueDate: task.due_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    // A membership assignment is xvm-api's record of who actually claimed the
    // task (set by start()'s self-assign, or a future direct-assign path) -
    // distinct from assignedRole, which is who the task was handed to as a pool.
    assignee: membership ? { id: membership.id, name: membership.person.display_name } : null,
    assignedRole: position ? { id: position.id, name: position.name, color: position.color } : null,
  }
}

async function shapeAfterFetch(token: string, xvmApiVenueId: string, task: TaskRow) {
  const [positions, categories, memberships] = await Promise.all([
    listPositions(token, xvmApiVenueId),
    listTaskCategories(token, xvmApiVenueId),
    listMemberships(token, xvmApiVenueId),
  ])
  const positionsById = new Map(positions.map((p) => [p.id, p]))
  const membershipsById = new Map(memberships.map((m) => [m.id, m]))
  const categoryName = task.category_id !== null ? categories.find((c) => c.id === task.category_id)?.name ?? null : null
  return toTaskShape(task, positionsById, membershipsById, categoryName)
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = parseId(taskId)
    if (id === null) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tasks] /me/venues read error")
    if (!lookup.ok) return lookup.response
    const xvmApiVenueId = lookup.venue.id

    try {
      // No get-one endpoint is needed here - list+find matches the Roles
      // cutover's precedent (roles/[roleId]/route.ts does the same, since
      // xvm-api's Positions module also lacks a get-one; Tasks does have
      // GET /{task_id} on xvm-api, but reusing list+find keeps this route
      // consistent with the sibling cutover rather than mixing both styles).
      const tasks = await listTasks(token, xvmApiVenueId, { includeCompleted: true, includeCancelled: true })
      const task = tasks.find((t) => t.id === id)
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }
      return NextResponse.json(await shapeAfterFetch(token, xvmApiVenueId, task))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tasks] GET one error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = parseId(taskId)
    if (id === null) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tasks] /me/venues read error")
    if (!lookup.ok) return lookup.response
    const xvmApiVenueId = lookup.venue.id

    let data: z.infer<typeof updateTaskSchema>
    try {
      data = updateTaskSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let categoryId: number | null | undefined
      if (data.category !== undefined) {
        categoryId = data.category ? await resolveCategoryId(token, xvmApiVenueId, data.category) : null
      }

      // xvm-api splits descriptive edits (PATCH) from reassignment (/assign) -
      // sequence both if assignedRoleId was included, since the dashboard
      // still exposes them as one form submission (see Task C6).
      let task = await updateTask(token, xvmApiVenueId, id, {
        title: data.title,
        description: data.description,
        priority: data.priority ? priorityToInt(data.priority) : undefined,
        due_at: data.dueDate,
        category_id: categoryId,
      })

      if (data.assignedRoleId !== undefined) {
        try {
          task = await assignTask(token, xvmApiVenueId, id, {
            position_id: data.assignedRoleId,
            membership_id: null,
          })
        } catch (assignErr) {
          // The descriptive edit above already landed - a blanket error here
          // would hide that from the caller. Surface it as a partial success
          // instead, but only for a real xvm-api rejection (a genuine 401 or
          // network failure still needs the outer catch's classification).
          if (assignErr instanceof XvmApiError && assignErr.status !== 401) {
            return NextResponse.json(
              {
                ...(await shapeAfterFetch(token, xvmApiVenueId, task)),
                partial: true,
                error: xvmErrorMessage(assignErr),
              },
              { status: 200 }
            )
          }
          throw assignErr
        }
      }

      return NextResponse.json(await shapeAfterFetch(token, xvmApiVenueId, task))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tasks] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)

// Replaces the old flat status-field write. One endpoint for all three
// transitions rather than three route files, since the frontend only ever
// fires one at a time (see Task C6) - matches this route file's existing
// one-file-per-resource shape better than adding start/complete/cancel as
// sibling [taskId] subpaths would.
export const POST = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = parseId(taskId)
    if (id === null) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tasks] /me/venues read error")
    if (!lookup.ok) return lookup.response
    const xvmApiVenueId = lookup.venue.id

    let data: z.infer<typeof transitionSchema>
    try {
      data = transitionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const task =
        data.action === "start"
          ? await startTask(token, xvmApiVenueId, id)
          : data.action === "complete"
            ? await completeTask(token, xvmApiVenueId, id)
            : await cancelTask(token, xvmApiVenueId, id, data.reason ?? null)

      if (data.action === "complete") {
        const venue = await prisma.venue.findUnique({
          where: { xvmApiVenueId },
          select: { discordWebhookUrl: true, settings: true },
        })
        if (venue) {
          const venueSettings = venue.settings as Record<string, unknown> | null
          const webhookConfig: VenueWebhookConfig = {
            discordWebhooks: venueSettings?.discordWebhooks as VenueWebhookConfig["discordWebhooks"],
            webhooks: venueSettings?.webhooks as VenueWebhookConfig["webhooks"],
            discordWebhookUrl: venue.discordWebhookUrl,
          }
          const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCompleted")
          if (webhookUrl) {
            const embed = formatTaskCompletedEmbed({
              title: task.title,
              priority: intToPriority(task.priority),
              completer: null, // completed_by_person_id has no display-name lookup wired here - out of scope, see plan notes
            })
            sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
              console.error("[Task Completed] webhook error:", error)
            )
          }
        }
      }

      return NextResponse.json(await shapeAfterFetch(token, xvmApiVenueId, task))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tasks] transition error")
    }
  },
  { requests: 20, window: "1 m" }
)

// Delete->cancel decision: xvm-api has no hard delete, only an audited
// soft-cancel. No reason field is collected from this call site today - the
// dashboard has no UI for entering one yet (out of scope here, a future
// "why was this cancelled" UI is a follow-up).
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = parseId(taskId)
    if (id === null) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[tasks] /me/venues read error")
    if (!lookup.ok) return lookup.response
    const xvmApiVenueId = lookup.venue.id

    try {
      await cancelTask(token, xvmApiVenueId, id, null)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[tasks] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
