"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageLoading } from "@/components/ui/loading-spinner"
import { MultiSelect } from "@/components/ui/multi-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Trash2, Users, X } from "lucide-react"
import { adminLoadErrorMessage } from "@/lib/admin-load-error"
import { initials } from "@/lib/team-groups"
import { clampFrame, photoImageStyle } from "@/lib/team-photo"
import type { AdminTeamMember, TeamCandidate, TeamCatalogueItem, TeamCatalogueKind } from "@/lib/api/xvm-api"

interface Draft {
  role_ids: number[]
  group_id: string
  sort_order: string
}

const toDraft = (m: AdminTeamMember): Draft => ({
  role_ids: m.role_ids,
  group_id: String(m.group_id),
  sort_order: String(m.sort_order),
})

const JSON_HEADERS = { "Content-Type": "application/json" }

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === "string" ? body.error : fallback
}

const sameIds = (a: number[], b: number[]) => {
  const x = [...a].sort((p, q) => p - q)
  const y = [...b].sort((p, q) => p - q)
  return x.length === y.length && x.every((id, i) => id === y[i])
}

const isDirty = (m: AdminTeamMember, d: Draft) =>
  !sameIds(m.role_ids, d.role_ids) || d.group_id !== String(m.group_id) || d.sort_order !== String(m.sort_order)

const ICON_BUTTON = "h-8 w-8 shrink-0 max-sm:h-11 max-sm:w-11"
const SPINNER = <Loader2 className="h-4 w-4 animate-spin" />

function useBusy() {
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  async function run(key: string, task: () => Promise<unknown>) {
    if (busy[key]) return
    setBusy((prev) => ({ ...prev, [key]: true }))
    try {
      await task()
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }))
    }
  }
  return [busy, run] as const
}

const toOptions = (items: TeamCatalogueItem[]) => items.map((i) => ({ value: i.id, label: i.name }))

interface CataloguePanelProps {
  kind: TeamCatalogueKind
  title: string
  hint?: string
  noun: string
  maxLength: number
  items: TeamCatalogueItem[]
  onChanged: (membersAffected: boolean) => Promise<void>
}

function CataloguePanel({ kind, title, hint, noun, maxLength, items, onChanged }: CataloguePanelProps) {
  const base = `/api/admin/team-catalogue/${kind}`
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [newName, setNewName] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, run] = useBusy()

  function fail(id: number, text: string) {
    setRowErrors((prev) => ({ ...prev, [id]: text }))
  }

  async function rename(item: TeamCatalogueItem) {
    const name = editValue.trim()
    if (name === "" || name === item.name) return setEditingId(null)
    const res = await fetch(`${base}/${item.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name }) })
    if (!res.ok) return fail(item.id, await message(res, "Couldn't rename that."))
    setRowErrors({})
    setEditingId(null)
    await onChanged(true)
  }

  async function move(index: number, by: -1 | 1) {
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    const res = await fetch(`${base}/order`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ ids }) })
    if (!res.ok) return fail(items[index].id, await message(res, "Couldn't reorder."))
    setRowErrors({})
    await onChanged(true)
  }

  async function remove(item: TeamCatalogueItem) {
    const res = await fetch(`${base}/${item.id}`, { method: "DELETE" })
    if (!res.ok) return fail(item.id, await message(res, "Couldn't remove that."))
    setRowErrors({})
    await onChanged(true)
  }

  async function add() {
    const name = newName.trim()
    if (name === "") return
    setAddError(null)
    const res = await fetch(base, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) })
    if (!res.ok) return setAddError(await message(res, "Couldn't add that."))
    setNewName("")
    await onChanged(false)
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--blue-018)] bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      <ul className="divide-y divide-[var(--blue-008)]">
        {items.map((item, index) => (
          <li key={item.id} className="py-2">
            <div className="flex items-center gap-1 max-sm:gap-0">
              {editingId === item.id ? (
                <>
                  <Input
                    autoFocus
                    value={editValue}
                    maxLength={maxLength}
                    aria-label={`New name for ${item.name}`}
                    className="h-8"
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void run(`rename-${item.id}`, () => rename(item))
                      if (e.key === "Escape") setEditingId(null)
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_BUTTON}
                    aria-label="Save name"
                    disabled={busy[`rename-${item.id}`]}
                    onClick={() => void run(`rename-${item.id}`, () => rename(item))}
                  >
                    {busy[`rename-${item.id}`] ? SPINNER : <Check className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className={ICON_BUTTON} aria-label="Cancel" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-sm">{item.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_BUTTON}
                    aria-label={`Rename ${item.name}`}
                    onClick={() => {
                      setEditingId(item.id)
                      setEditValue(item.name)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_BUTTON}
                    aria-label={`Move ${item.name} up`}
                    disabled={index === 0 || busy[`move-${item.id}`]}
                    onClick={() => void run(`move-${item.id}`, () => move(index, -1))}
                  >
                    {busy[`move-${item.id}`] ? SPINNER : <ArrowUp className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_BUTTON}
                    aria-label={`Move ${item.name} down`}
                    disabled={index === items.length - 1 || busy[`move-${item.id}`]}
                    onClick={() => void run(`move-${item.id}`, () => move(index, 1))}
                  >
                    {busy[`move-${item.id}`] ? SPINNER : <ArrowDown className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ICON_BUTTON}
                    aria-label={`Remove ${item.name}`}
                    title={item.member_count > 0 ? `Can't remove: used by ${item.member_count} ${item.member_count === 1 ? "person" : "people"}.` : `Remove ${item.name}`}
                    disabled={item.member_count > 0 || busy[`remove-${item.id}`]}
                    onClick={() => void run(`remove-${item.id}`, () => remove(item))}
                  >
                    {busy[`remove-${item.id}`] ? SPINNER : <Trash2 className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
            {item.member_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Used by {item.member_count} {item.member_count === 1 ? "person" : "people"}
              </p>
            )}
            {rowErrors[item.id] && <p className="text-xs text-destructive">{rowErrors[item.id]}</p>}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={newName}
          maxLength={maxLength}
          placeholder={`New ${noun}`}
          aria-label={`New ${noun}`}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run("add", add)}
        />
        <Button variant="outline" onClick={() => void run("add", add)} disabled={newName.trim() === "" || busy.add}>
          {busy.add && SPINNER}
          Add
        </Button>
      </div>
      {addError && <p className="text-xs text-destructive">{addError}</p>}
    </div>
  )
}

export default function AdminTeamPage() {
  const { status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminTeamMember[]>([])
  const [roles, setRoles] = useState<TeamCatalogueItem[]>([])
  const [groups, setGroups] = useState<TeamCatalogueItem[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, run] = useBusy()
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [savedId, setSavedId] = useState<number | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<TeamCandidate[]>([])
  const [searched, setSearched] = useState(false)
  const [picked, setPicked] = useState<TeamCandidate | null>(null)
  const [newRoles, setNewRoles] = useState<number[]>([])
  const [newGroup, setNewGroup] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    },
    []
  )

  function load(list: AdminTeamMember[]) {
    setMembers(list)
    setDrafts(Object.fromEntries(list.map((m) => [m.person_id, toDraft(m)])))
  }

  async function fetchMembers() {
    const res = await fetch("/api/admin/team")
    if (res.ok) load(await res.json())
  }

  async function fetchCatalogue(kind: TeamCatalogueKind) {
    const res = await fetch(`/api/admin/team-catalogue/${kind}`)
    if (!res.ok) return
    const items: TeamCatalogueItem[] = await res.json()
    if (kind === "roles") setRoles(items)
    else setGroups(items)
  }

  useEffect(() => {
    if (status !== "authenticated") return
    Promise.all([fetch("/api/admin/team"), fetch("/api/admin/team-catalogue/roles"), fetch("/api/admin/team-catalogue/groups")])
      .then(async ([teamRes, rolesRes, groupsRes]) => {
        const failed = [teamRes, rolesRes, groupsRes].find((r) => !r.ok)
        if (failed) return setLoadError(adminLoadErrorMessage(failed.status))
        load(await teamRes.json())
        setRoles(await rolesRes.json())
        setGroups(await groupsRes.json())
      })
      .catch(() => setLoadError("Couldn't reach the server."))
      .finally(() => setLoading(false))
  }, [status])

  async function search() {
    setAddError(null)
    setPicked(null)
    setCandidates([])
    setSearched(false)
    if (query.trim().length < 2) return setAddError("Type at least two letters of their name.")
    const res = await fetch(`/api/admin/team/candidates?q=${encodeURIComponent(query.trim())}`)
    if (!res.ok) return setAddError(await message(res, "Search failed."))
    setCandidates(await res.json())
    setSearched(true)
  }

  async function add() {
    if (!picked) return
    setAddError(null)
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        person_id: picked.person_id,
        role_ids: newRoles,
        group_id: Number(newGroup),
        sort_order: members.length,
      }),
    })
    if (!res.ok) return setAddError(await message(res, "Couldn't add that person."))
    const added: AdminTeamMember = await res.json()
    load([...members, added])
    setPicked(null)
    setCandidates([])
    setSearched(false)
    setQuery("")
    setNewRoles([])
    setNewGroup("")
    await Promise.all([fetchCatalogue("roles"), fetchCatalogue("groups")])
  }

  function setRowError(personId: number, text: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev }
      if (text === null) delete next[personId]
      else next[personId] = text
      return next
    })
  }

  async function saveRow(member: AdminTeamMember) {
    const draft = drafts[member.person_id]
    setRowError(member.person_id, null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        role_ids: draft.role_ids,
        group_id: Number(draft.group_id),
        sort_order: Number(draft.sort_order),
      }),
    })
    if (!res.ok) return setRowError(member.person_id, await message(res, "Couldn't save that row."))
    const updated: AdminTeamMember = await res.json()
    load(members.map((m) => (m.person_id === updated.person_id ? updated : m)))
    setSavedId(member.person_id)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedId(null), 2000)
    await Promise.all([fetchCatalogue("roles"), fetchCatalogue("groups")])
  }

  async function remove(member: AdminTeamMember) {
    setRowError(member.person_id, null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, { method: "DELETE" })
    if (!res.ok) return setRowError(member.person_id, await message(res, "Couldn't remove that person."))
    load(members.filter((m) => m.person_id !== member.person_id))
    await Promise.all([fetchCatalogue("roles"), fetchCatalogue("groups")])
  }

  function reloadCatalogue(kind: TeamCatalogueKind) {
    return async (membersAffected: boolean) => {
      await Promise.all([fetchCatalogue(kind), membersAffected ? fetchMembers() : Promise.resolve()])
    }
  }

  if (status === "loading" || loading) return <PageLoading />

  if (loadError) {
    return (
      <div className="page-inner mx-auto">
        <p className="text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  const roleOptions = toOptions(roles)
  const groupItems = groups.map((g) => (
    <SelectItem key={g.id} value={String(g.id)}>
      {g.name}
    </SelectItem>
  ))

  return (
    <div className="page-inner mx-auto">
      <div className="max-w-[880px]">
        <h1 className="page-h1 flex items-center gap-2">
          <Users className="h-6 w-6 text-[var(--xiv-blue)]" />
          Team
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Who is on the Meet the team page, and how they are grouped.</p>

        <section className="mt-8 space-y-3 rounded-xl border border-[var(--blue-018)] bg-card p-4">
          <h2 className="text-sm font-semibold">Add someone</h2>
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder="Search by name"
              aria-label="Search people by name"
              onChange={(e) => {
                setQuery(e.target.value)
                setSearched(false)
              }}
              onKeyDown={(e) => e.key === "Enter" && void run("search", search)}
            />
            <Button variant="outline" onClick={() => void run("search", search)} disabled={busy.search}>
              {busy.search && SPINNER}
              Search
            </Button>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          {searched && candidates.length === 0 && !picked && (
            <p className="text-sm text-muted-foreground">
              No one matches that name. Only people with an account who are not already on the team can be added.
            </p>
          )}
          {candidates.length > 0 && !picked && (
            <ul className="divide-y divide-[var(--blue-008)] rounded-md border border-[var(--blue-008)]">
              {candidates.map((c) => (
                <li key={c.person_id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--blue-004)]"
                    onClick={() => setPicked(c)}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && roles.length === 0 && (
            <p className="text-sm text-muted-foreground">Add a role first, then you can add {picked.name}.</p>
          )}
          {picked && roles.length > 0 && groups.length === 0 && (
            <p className="text-sm text-muted-foreground">Add a group first, then you can add {picked.name}.</p>
          )}
          {picked && roles.length > 0 && groups.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="new-role">Roles for {picked.name}</Label>
                <MultiSelect
                  id="new-role"
                  className="w-full"
                  options={roleOptions}
                  value={newRoles}
                  onChange={setNewRoles}
                  placeholder="Choose roles"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-group">Group</Label>
                <Select value={newGroup} onValueChange={setNewGroup}>
                  <SelectTrigger id="new-group" className="w-full">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>{groupItems}</SelectContent>
                </Select>
              </div>
              <Button onClick={() => void run("add-person", add)} disabled={newRoles.length === 0 || newGroup === "" || busy["add-person"]}>
                {busy["add-person"] && SPINNER}
                Add
              </Button>
            </div>
          )}
        </section>

        <section className="mt-8 space-y-3">
          <p className="text-xs text-muted-foreground">People follow their order number inside each group.</p>
          {members.length === 0 && <p className="text-sm text-muted-foreground">Nobody is on the team yet.</p>}
          {members.map((member, index) => {
            const draft = drafts[member.person_id]
            const dirty = isDirty(member, draft)
            const saveKey = `save-${member.person_id}`
            const removeKey = `remove-${member.person_id}`
            return (
              <div key={member.person_id} className="space-y-3">
                {(index === 0 || members[index - 1].group !== member.group) && (
                  <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{member.group}</h3>
                )}
                <div className="rounded-xl border border-[var(--blue-018)] bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {member.photo_url ? (
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={member.photo_url}
                            alt=""
                            style={photoImageStyle(clampFrame({ x: member.photo_x, y: member.photo_y, zoom: member.photo_zoom }))}
                          />
                        </span>
                      ) : (
                        <Avatar className="size-10">
                          <AvatarFallback className="bg-gradient-to-br from-[#0a3a5c] to-[#00b4ff44] font-heading text-sm font-semibold text-[var(--xiv-blue)]">
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-heading text-base font-semibold">{member.name}</span>
                        {!member.listed && (
                          <Badge variant="outline" title="Hidden by them on the team page">
                            Hidden
                          </Badge>
                        )}
                        {dirty && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--xiv-blue)]" />
                            Unsaved changes
                          </span>
                        )}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="max-sm:h-11 max-sm:w-11"
                          aria-label={`Remove ${member.name}`}
                          disabled={busy[removeKey]}
                        >
                          {busy[removeKey] ? SPINNER : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Their card and photo are deleted. Their account is not touched, and you can add them again later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void run(removeKey, () => remove(member))}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`role-${member.person_id}`}>Roles</Label>
                      <MultiSelect
                        id={`role-${member.person_id}`}
                        className="w-full"
                        options={roleOptions}
                        value={draft.role_ids}
                        onChange={(role_ids) => setDrafts({ ...drafts, [member.person_id]: { ...draft, role_ids } })}
                        placeholder="Choose roles"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`group-${member.person_id}`}>Group</Label>
                      <Select
                        value={draft.group_id}
                        onValueChange={(group_id) => setDrafts({ ...drafts, [member.person_id]: { ...draft, group_id } })}
                      >
                        <SelectTrigger id={`group-${member.person_id}`} className="w-full">
                          <SelectValue placeholder="Choose a group" />
                        </SelectTrigger>
                        <SelectContent>{groupItems}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-3 sm:contents">
                      <div className="w-24 space-y-1 sm:w-auto">
                        <Label htmlFor={`order-${member.person_id}`}>Order</Label>
                        <Input
                          id={`order-${member.person_id}`}
                          type="number"
                          min={0}
                          className="h-9"
                          value={draft.sort_order}
                          onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, sort_order: e.target.value } })}
                        />
                      </div>
                      <div className="relative flex items-center">
                        <Button
                          variant="outline"
                          disabled={!dirty || draft.role_ids.length === 0 || busy[saveKey]}
                          onClick={() => void run(saveKey, () => saveRow(member))}
                        >
                          {busy[saveKey] && SPINNER}
                          Save
                        </Button>
                        {savedId === member.person_id && (
                          <span
                            role="status"
                            aria-live="polite"
                            className="absolute left-0 top-full mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:bottom-full sm:left-auto sm:right-0 sm:top-auto sm:mb-1 sm:mt-0"
                          >
                            <Check className="h-4 w-4" />
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {rowErrors[member.person_id] && <p className="mt-2 text-sm text-destructive">{rowErrors[member.person_id]}</p>}
                </div>
              </div>
            )
          })}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-semibold">Lists</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <CataloguePanel kind="roles" title="Roles" noun="role" maxLength={80} items={roles} onChanged={reloadCatalogue("roles")} />
            <CataloguePanel
              kind="groups"
              title="Groups"
              hint="Sections on the team page follow this order."
              noun="group"
              maxLength={40}
              items={groups}
              onChanged={reloadCatalogue("groups")}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
