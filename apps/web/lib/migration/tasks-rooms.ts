export interface ExportedTask {
  id: string
  venueId: string
  assignedTo: string | null
  assignedRoleId: string | null
  title: string
  description: string | null
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  category: string | null
  dueDate: string | null
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ExportedRoom {
  id: string
  venueId: string
  name: string
  isOccupied: boolean
  note: string | null
  updatedAt: string
  updatedById: string | null
  disabled: boolean
  froggeRoomId: string | null
  imageUrl: string | null
  locked: boolean
  ownerDiscordId: string | null
  roomNumber: number | null
}

export interface TasksRoomsExport {
  tasks: ExportedTask[]
  rooms: ExportedRoom[]
}

export interface TasksRoomsContext {
  personKeys: ReadonlySet<string>
  memberships: ReadonlyMap<string, { venue: string; person: string }>
  positions: ReadonlyMap<string, string>
  discordPeople: ReadonlyMap<string, string>
}

export interface TaskCategoryRow {
  key: string
  venue_key: string
  name: string
}

export interface TaskRow {
  key: string
  venue_key: string
  category_key: string | null
  assigned_membership_key: string | null
  assigned_position_key: string | null
  title: string
  description: string | null
  priority: 0 | 1 | 2 | 3
  due_at: string | null
  started_at: string | null
  completed_at: string | null
  completed_by_person_key: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface RoomRow {
  key: string
  venue_key: string
  owner_membership_key: string | null
  name: string
  notes: string | null
  room_number: number | null
  locked: boolean
  disabled: boolean
  updated_by_person_key: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface TasksRoomsResult {
  taskCategories: TaskCategoryRow[]
  tasks: TaskRow[]
  rooms: RoomRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const PRIORITY: Record<ExportedTask["priority"], TaskRow["priority"]> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 }
const MAX_TITLE = 200
const MAX_CATEGORY = 50
const MAX_ROOM_NAME = 100
const MAX_ROOM_NOTES = 500

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapTasksRooms(source: TasksRoomsExport, ctx: TasksRoomsContext): TasksRoomsResult {
  const result: TasksRoomsResult = { taskCategories: [], tasks: [], rooms: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const membershipFor = new Map<string, string>()
  for (const [key, m] of ctx.memberships) membershipFor.set(`${m.venue}|${m.person}`, key)

  const categoryKeys = new Set<string>()
  let bothAssignees = 0
  let assigneeWithoutMembership = 0

  for (const t of [...source.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    let title = squash(t.title)
    let description = t.description === null ? null : t.description.trim() || null
    if (!title) {
      skip(t.id, "blank title")
      continue
    }
    if (title.length > MAX_TITLE) {
      description = description === null ? title : `${title}\n\n${description}`
      title = title.slice(0, MAX_TITLE)
      warn(t.id, `title cut to ${MAX_TITLE} characters, the full title is at the top of the description`)
    }

    let categoryKey: string | null = null
    const rawCategory = t.category === null ? "" : squash(t.category).slice(0, MAX_CATEGORY)
    if (rawCategory) {
      categoryKey = `${t.venueId}|${rawCategory.toLowerCase()}`
      if (!categoryKeys.has(categoryKey)) {
        categoryKeys.add(categoryKey)
        result.taskCategories.push({ key: categoryKey, venue_key: t.venueId, name: rawCategory })
      }
    }

    let membershipKey: string | null = null
    if (t.assignedTo !== null) {
      membershipKey = membershipFor.get(`${t.venueId}|${t.assignedTo}`) ?? null
      if (membershipKey === null) assigneeWithoutMembership++
    }
    let positionKey: string | null = null
    if (t.assignedRoleId !== null) {
      if (ctx.positions.get(t.assignedRoleId) === t.venueId) positionKey = t.assignedRoleId
      else warn(t.id, "assigned position was not loaded, left unassigned")
    }
    if (membershipKey !== null && positionKey !== null) {
      positionKey = null
      bothAssignees++
    }

    const completedBy = t.completedBy !== null && ctx.personKeys.has(t.completedBy) ? t.completedBy : null
    result.tasks.push({
      key: t.id,
      venue_key: t.venueId,
      category_key: categoryKey,
      assigned_membership_key: membershipKey,
      assigned_position_key: positionKey,
      title,
      description,
      priority: PRIORITY[t.priority],
      due_at: t.dueDate,
      started_at: t.status === "IN_PROGRESS" ? t.updatedAt : null,
      completed_at: t.status === "COMPLETED" ? (t.completedAt ?? t.updatedAt) : null,
      completed_by_person_key: t.status === "COMPLETED" ? completedBy : null,
      cancelled_at: t.status === "CANCELLED" ? t.updatedAt : null,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    })
  }

  const roomNames = new Set<string>()
  const roomNumbers = new Set<string>()
  let occupied = 0
  let linkedToFrogge = 0

  for (const r of [...source.rooms].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))) {
    const name = squash(r.name)
    if (!name) {
      skip(r.id, "blank name")
      continue
    }
    if (name.length > MAX_ROOM_NAME) {
      skip(r.id, `name over ${MAX_ROOM_NAME} characters`)
      continue
    }
    const nameKey = `${r.venueId}|${name.toLowerCase()}`
    if (roomNames.has(nameKey)) {
      skip(r.id, "same name as an earlier room at this venue, ignoring case")
      continue
    }
    roomNames.add(nameKey)

    let roomNumber = r.roomNumber
    if (roomNumber !== null) {
      const numberKey = `${r.venueId}|${roomNumber}`
      if (roomNumber <= 0 || roomNumbers.has(numberKey)) {
        warn(r.id, `room number ${roomNumber} is not usable at this venue, left empty`)
        roomNumber = null
      } else {
        roomNumbers.add(numberKey)
      }
    }

    let ownerKey: string | null = null
    if (r.ownerDiscordId !== null) {
      const person = ctx.discordPeople.get(r.ownerDiscordId)
      ownerKey = person ? (membershipFor.get(`${r.venueId}|${person}`) ?? null) : null
      if (ownerKey === null) warn(r.id, "owner has no membership at this venue, left without an owner")
    }
    if (r.isOccupied) occupied++
    if (r.froggeRoomId !== null) linkedToFrogge++

    let notes = r.note === null ? null : r.note.trim() || null
    if (notes !== null && notes.length > MAX_ROOM_NOTES) {
      notes = notes.slice(0, MAX_ROOM_NOTES)
      warn(r.id, `note cut to ${MAX_ROOM_NOTES} characters`)
    }

    result.rooms.push({
      key: r.id,
      venue_key: r.venueId,
      owner_membership_key: ownerKey,
      name,
      notes,
      room_number: roomNumber,
      locked: r.locked,
      disabled: r.disabled,
      updated_by_person_key: r.updatedById !== null && ctx.personKeys.has(r.updatedById) ? r.updatedById : null,
      image_url: r.imageUrl === null ? null : r.imageUrl.trim() || null,
      created_at: r.updatedAt,
      updated_at: r.updatedAt,
    })
  }

  if (bothAssignees > 0) warn("tasks", `${bothAssignees} tasks had a person and a position, kept the person because xvm-api allows one`)
  if (assigneeWithoutMembership > 0) warn("tasks", `${assigneeWithoutMembership} tasks were assigned to someone with no membership at that venue, left unassigned`)
  if (occupied > 0) warn("rooms", `${occupied} rooms were marked occupied, no reservation was made for them`)
  if (linkedToFrogge > 0) warn("rooms", `${linkedToFrogge} rooms were linked to a Frogge room, the link is not migrated`)
  return result
}
