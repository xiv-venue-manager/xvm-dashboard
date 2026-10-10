import { describe, it, expect } from "vitest"
import { mapTasksRooms, type ExportedRoom, type ExportedTask, type TasksRoomsContext } from "./tasks-rooms"

const task = (over: Partial<ExportedTask> = {}): ExportedTask => ({
  id: "t1",
  venueId: "v1",
  assignedTo: null,
  assignedRoleId: null,
  title: "Set up the stage",
  description: null,
  status: "PENDING",
  priority: "MEDIUM",
  category: null,
  dueDate: null,
  completedAt: null,
  completedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...over,
})

const room = (over: Partial<ExportedRoom> = {}): ExportedRoom => ({
  id: "r1",
  venueId: "v1",
  name: "Room 1",
  isOccupied: false,
  note: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedById: null,
  disabled: false,
  froggeRoomId: null,
  imageUrl: null,
  locked: false,
  ownerDiscordId: null,
  roomNumber: null,
  ...over,
})

const ctx = (over: Partial<TasksRoomsContext> = {}): TasksRoomsContext => ({
  personKeys: new Set(["u1", "u2"]),
  memberships: new Map([["m1", { venue: "v1", person: "u1" }]]),
  positions: new Map([["r1", "v1"]]),
  discordPeople: new Map([["111111111111111111", "u1"]]),
  ...over,
})

const run = (tasks: ExportedTask[], rooms: ExportedRoom[] = [], c: TasksRoomsContext = ctx()) => mapTasksRooms({ tasks, rooms }, c)

describe("tasks", () => {
  it("maps a pending task with a priority number", () => {
    expect(run([task({ priority: "URGENT", dueDate: "2026-02-01T00:00:00.000Z" })]).tasks[0]).toEqual({
      key: "t1", venue_key: "v1", category_key: null, assigned_membership_key: null, assigned_position_key: null,
      title: "Set up the stage", description: null, priority: 3, due_at: "2026-02-01T00:00:00.000Z",
      started_at: null, completed_at: null, completed_by_person_key: null, cancelled_at: null,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
    })
  })

  it("maps every priority", () => {
    const r = run([task({ id: "a", priority: "LOW" }), task({ id: "b", priority: "MEDIUM" }), task({ id: "c", priority: "HIGH" })])
    expect(r.tasks.map((t) => t.priority)).toEqual([0, 1, 2])
  })

  it("starts an in-progress task at its last update", () => {
    expect(run([task({ status: "IN_PROGRESS" })]).tasks[0].started_at).toBe("2026-01-02T00:00:00.000Z")
  })

  it("completes a completed task with its time and person, falling back to the last update", () => {
    const r = run([task({ id: "a", status: "COMPLETED", completedAt: "2026-01-05T00:00:00.000Z", completedBy: "u2" }), task({ id: "b", status: "COMPLETED", completedBy: "ghost" })])
    expect(r.tasks[0]).toMatchObject({ completed_at: "2026-01-05T00:00:00.000Z", completed_by_person_key: "u2", cancelled_at: null })
    expect(r.tasks[1]).toMatchObject({ completed_at: "2026-01-02T00:00:00.000Z", completed_by_person_key: null })
  })

  it("dates a cancelled task by its last update", () => {
    expect(run([task({ status: "CANCELLED" })]).tasks[0]).toMatchObject({ cancelled_at: "2026-01-02T00:00:00.000Z", completed_at: null })
  })

  it("makes one category per venue and name, ignoring case", () => {
    const r = run([task({ id: "a", category: "Setup" }), task({ id: "b", category: " setup " }), task({ id: "c", category: "Setup", venueId: "v2" })])
    expect(r.taskCategories).toEqual([
      { key: "v1|setup", venue_key: "v1", name: "Setup" },
      { key: "v2|setup", venue_key: "v2", name: "Setup" },
    ])
    expect(r.tasks.map((t) => t.category_key)).toEqual(["v1|setup", "v1|setup", "v2|setup"])
  })

  it("assigns a task to a position at its venue, or to a person through their membership", () => {
    const r = run([task({ id: "a", assignedRoleId: "r1" }), task({ id: "b", assignedTo: "u1" })])
    expect(r.tasks[0].assigned_position_key).toBe("r1")
    expect(r.tasks[1].assigned_membership_key).toBe("m1")
  })

  it("keeps the person and drops the position when a task has both, and counts it", () => {
    const r = run([task({ assignedTo: "u1", assignedRoleId: "r1" })])
    expect(r.tasks[0]).toMatchObject({ assigned_membership_key: "m1", assigned_position_key: null })
    expect(r.warnings).toEqual([{ key: "tasks", message: "1 tasks had a person and a position, kept the person because xvm-api allows one" }])
  })

  it("leaves a task unassigned when its person has no membership or its position was not loaded", () => {
    const r = run([task({ id: "a", assignedTo: "u2" }), task({ id: "b", assignedRoleId: "gone" })])
    expect(r.tasks.map((t) => [t.assigned_membership_key, t.assigned_position_key])).toEqual([[null, null], [null, null]])
    expect(r.warnings).toHaveLength(2)
  })

  it("cuts a title over 200 characters and puts the whole title in the description", () => {
    const title = "T".repeat(210)
    const r = run([task({ title, description: "Details" })])
    expect(r.tasks[0].title).toHaveLength(200)
    expect(r.tasks[0].description).toBe(`${title}\n\nDetails`)
  })

  it("skips a blank title", () => {
    expect(run([task({ title: "  " })]).skipped).toEqual([{ key: "t1", reason: "blank title" }])
  })
})

describe("rooms", () => {
  it("maps a room with its note, number and state", () => {
    const r = run([], [room({ name: " Room  1 ", note: " cosy ", roomNumber: 4, locked: true, disabled: true, imageUrl: "https://example.test/r.png", updatedById: "u2" })])
    expect(r.rooms[0]).toEqual({
      key: "r1", venue_key: "v1", owner_membership_key: null, name: "Room 1", notes: "cosy", room_number: 4,
      locked: true, disabled: true, updated_by_person_key: "u2", image_url: "https://example.test/r.png",
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    })
  })

  it("finds the owner through their Discord id and their membership", () => {
    expect(run([], [room({ ownerDiscordId: "111111111111111111" })]).rooms[0].owner_membership_key).toBe("m1")
  })

  it("leaves an owner with no membership out, with a warning", () => {
    const r = run([], [room({ ownerDiscordId: "999" })])
    expect(r.rooms[0].owner_membership_key).toBeNull()
    expect(r.warnings).toHaveLength(1)
  })

  it("keeps the earlier of two rooms that differ only by case at one venue", () => {
    const r = run([], [room({ id: "late", name: "room 1", updatedAt: "2026-02-01T00:00:00.000Z" }), room({ id: "early" }), room({ id: "other", venueId: "v2" })])
    expect(r.rooms.map((x) => x.key)).toEqual(["early", "other"])
    expect(r.skipped[0].key).toBe("late")
  })

  it("leaves out a room number that is already taken at the venue, or not positive", () => {
    const r = run([], [room({ id: "a", name: "A", roomNumber: 2 }), room({ id: "b", name: "B", roomNumber: 2 }), room({ id: "c", name: "C", roomNumber: 0 })])
    expect(r.rooms.map((x) => x.room_number)).toEqual([2, null, null])
  })

  it("counts rooms marked occupied and rooms linked to Frogge, which have no home", () => {
    const r = run([], [room({ isOccupied: true, froggeRoomId: "7" })])
    expect(r.warnings.map((w) => w.message)).toEqual([
      "1 rooms were marked occupied, no reservation was made for them",
      "1 rooms were linked to a Frogge room, the link is not migrated",
    ])
  })
})
