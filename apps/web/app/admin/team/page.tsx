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
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, Users, X } from "lucide-react"
import { adminLoadErrorMessage } from "@/lib/admin-load-error"
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

const toOptions = (items: TeamCatalogueItem[]) => items.map((i) => ({ value: i.id, label: i.name }))

interface CataloguePanelProps {
  kind: TeamCatalogueKind
  title: string
  noun: string
  maxLength: number
  items: TeamCatalogueItem[]
  onChanged: (membersAffected: boolean) => Promise<void>
}

function CataloguePanel({ kind, title, noun, maxLength, items, onChanged }: CataloguePanelProps) {
  const base = `/api/admin/team-catalogue/${kind}`
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [newName, setNewName] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

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
      <h2 className="text-sm font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      <ul className="divide-y divide-[var(--blue-008)]">
        {items.map((item, index) => (
          <li key={item.id} className="py-2">
            <div className="flex items-center gap-1">
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
                      if (e.key === "Enter") void rename(item)
                      if (e.key === "Escape") setEditingId(null)
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Save name" onClick={() => void rename(item)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Cancel" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                    onClick={() => {
                      setEditingId(item.id)
                      setEditValue(item.name)
                    }}
                  >
                    {item.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Rename ${item.name}`}
                    onClick={() => {
                      setEditingId(item.id)
                      setEditValue(item.name)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Move ${item.name} up`}
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Move ${item.name} down`}
                    disabled={index === items.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Remove ${item.name}`}
                    title={item.member_count > 0 ? `Can't remove: used by ${item.member_count} ${item.member_count === 1 ? "person" : "people"}.` : `Remove ${item.name}`}
                    disabled={item.member_count > 0}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <Button variant="outline" onClick={() => void add()} disabled={newName.trim() === ""}>
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
  const [error, setError] = useState<string | null>(null)
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
    setError(null)
    setPicked(null)
    setCandidates([])
    setSearched(false)
    if (query.trim().length < 2) return setError("Type at least two letters of their name.")
    const res = await fetch(`/api/admin/team/candidates?q=${encodeURIComponent(query.trim())}`)
    if (!res.ok) return setError(await message(res, "Search failed."))
    setCandidates(await res.json())
    setSearched(true)
  }

  async function add() {
    if (!picked) return
    setError(null)
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
    if (!res.ok) return setError(await message(res, "Couldn't add that person."))
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
      <div className="page-inner max-w-3xl mx-auto">
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
    <div className="page-inner max-w-3xl mx-auto">
      <h1 className="page-h1 flex items-center gap-2">
        <Users className="h-6 w-6 text-[var(--xiv-blue)]" />
        Team
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Who is on the Meet the team page, and what they are called there. Everyone needs a group, which is how the list
        separates people. Sections follow the order of each group&apos;s first person by order number.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <CataloguePanel kind="roles" title="Roles" noun="role" maxLength={80} items={roles} onChanged={reloadCatalogue("roles")} />
        <CataloguePanel kind="groups" title="Groups" noun="group" maxLength={40} items={groups} onChanged={reloadCatalogue("groups")} />
      </section>

      <section className="mt-8 space-y-3 rounded-xl border border-[var(--blue-018)] bg-card p-4">
        <h2 className="text-sm font-semibold">Add someone</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder="Search by name"
            onChange={(e) => {
              setQuery(e.target.value)
              setSearched(false)
            }}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <Button variant="outline" onClick={search}>
            Search
          </Button>
        </div>
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
            <Button onClick={add} disabled={newRoles.length === 0 || newGroup === ""}>
              Add
            </Button>
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        {members.length === 0 && <p className="text-sm text-muted-foreground">Nobody is on the team yet.</p>}
        {members.map((member) => {
          const draft = drafts[member.person_id]
          return (
            <div key={member.person_id} className="rounded-xl border border-[var(--blue-018)] bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-heading font-semibold">{member.name}</span>
                  {!member.listed && <span className="ml-2 text-xs text-muted-foreground">(hidden by them)</span>}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${member.name}`}>
                      <Trash2 className="h-4 w-4" />
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
                      <AlertDialogAction onClick={() => void remove(member)}>Remove</AlertDialogAction>
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
                <div className="space-y-1">
                  <Label htmlFor={`order-${member.person_id}`}>Order</Label>
                  <Input
                    id={`order-${member.person_id}`}
                    type="number"
                    min={0}
                    value={draft.sort_order}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, sort_order: e.target.value } })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={draft.role_ids.length === 0} onClick={() => void saveRow(member)}>
                    Save
                  </Button>
                  {savedId === member.person_id && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                </div>
              </div>
              {rowErrors[member.person_id] && <p className="mt-2 text-sm text-destructive">{rowErrors[member.person_id]}</p>}
            </div>
          )
        })}
      </section>
    </div>
  )
}
