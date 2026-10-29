"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageLoading } from "@/components/ui/loading-spinner"
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
import { Trash2, Users } from "lucide-react"
import { adminLoadErrorMessage } from "@/lib/admin-load-error"
import type { AdminTeamMember, TeamCandidate } from "@/lib/api/xvm-api"

interface Draft {
  role_title: string
  group_label: string
  sort_order: string
}

const toDraft = (m: AdminTeamMember): Draft => ({
  role_title: m.role_title,
  group_label: m.group_label ?? "",
  sort_order: String(m.sort_order),
})

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === "string" ? body.error : fallback
}

export default function AdminTeamPage() {
  const { status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminTeamMember[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<TeamCandidate[]>([])
  const [searched, setSearched] = useState(false)
  const [picked, setPicked] = useState<TeamCandidate | null>(null)
  const [newRole, setNewRole] = useState("")
  const [newGroup, setNewGroup] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  function load(list: AdminTeamMember[]) {
    setMembers(list)
    setDrafts(Object.fromEntries(list.map((m) => [m.person_id, toDraft(m)])))
  }

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/admin/team")
      .then(async (res) => {
        if (!res.ok) return setLoadError(adminLoadErrorMessage(res.status))
        load(await res.json())
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_id: picked.person_id,
        role_title: newRole,
        group_label: newGroup.trim() === "" ? null : newGroup,
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
    setNewRole("")
    setNewGroup("")
  }

  async function saveRow(member: AdminTeamMember) {
    const draft = drafts[member.person_id]
    setError(null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_title: draft.role_title,
        group_label: draft.group_label.trim() === "" ? null : draft.group_label,
        sort_order: Number(draft.sort_order),
      }),
    })
    if (!res.ok) return setError(await message(res, "Couldn't save that row."))
    const updated: AdminTeamMember = await res.json()
    load(members.map((m) => (m.person_id === updated.person_id ? updated : m)))
  }

  async function remove(member: AdminTeamMember) {
    setError(null)
    const res = await fetch(`/api/admin/team/${member.person_id}`, { method: "DELETE" })
    if (!res.ok) return setError(await message(res, "Couldn't remove that person."))
    load(members.filter((m) => m.person_id !== member.person_id))
  }

  if (status === "loading" || loading) return <PageLoading />

  if (loadError) {
    return (
      <div className="page-inner max-w-3xl">
        <p className="text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="page-inner max-w-3xl">
      <h1 className="page-h1 flex items-center gap-2">
        <Users className="h-6 w-6 text-[var(--xiv-blue)]" />
        Team
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Who is on the Meet the team page, and what they are called there. Sections follow the order of each group&apos;s first
        person by order number.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

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
        {picked && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="new-role">Role for {picked.name}</Label>
              <Input id="new-role" value={newRole} maxLength={80} onChange={(e) => setNewRole(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-group">Group (optional)</Label>
              <Input id="new-group" value={newGroup} maxLength={40} onChange={(e) => setNewGroup(e.target.value)} />
            </div>
            <Button onClick={add} disabled={newRole.trim() === ""}>
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
                  <Label htmlFor={`role-${member.person_id}`}>Role</Label>
                  <Input
                    id={`role-${member.person_id}`}
                    value={draft.role_title}
                    maxLength={80}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, role_title: e.target.value } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`group-${member.person_id}`}>Group</Label>
                  <Input
                    id={`group-${member.person_id}`}
                    value={draft.group_label}
                    maxLength={40}
                    onChange={(e) => setDrafts({ ...drafts, [member.person_id]: { ...draft, group_label: e.target.value } })}
                  />
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
                <Button variant="outline" onClick={() => void saveRow(member)} disabled={draft.role_title.trim() === ""}>
                  Save
                </Button>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
