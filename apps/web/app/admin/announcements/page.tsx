"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { Megaphone, Trash2, Plus, X } from "lucide-react"
import { format } from "date-fns"
import { adminLoadErrorMessage } from "@/lib/admin-load-error"

interface Announcement {
  id: string
  title: string
  message: string
  link: string | null
  linkLabel: string | null
  expiresAt: string | null
  createdAt: string
}

const empty = { title: "", message: "", link: "", linkLabel: "", expiresAt: "" }

export default function AdminAnnouncementsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/admin/announcements")
      .then(async (r) => {
        if (!r.ok) return setLoadError(adminLoadErrorMessage(r.status))
        setAnnouncements(await r.json())
      })
      .catch(() => setLoadError("Couldn't reach the server."))
      .finally(() => setLoading(false))
  }, [status])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          link: form.link || null,
          linkLabel: form.linkLabel || null,
          expiresAt: form.expiresAt || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? "Failed to create")
        return
      }
      const created = await res.json()
      setAnnouncements((prev) => [created, ...prev])
      setForm(empty)
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" })
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
  }

  if (loading) return <PageLoading />

  if (loadError) {
    return (
      <div className="page-inner max-w-3xl">
        <div className="xiv-card rounded-xl p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to the dashboard</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-inner max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-h1 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-[var(--xiv-blue)]" />
            Announcements
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Broadcast feature updates and news to all logged-in users.
          </p>
        </div>
        <Button className="xiv-cta" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          {showForm ? "Cancel" : "New"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="xiv-card rounded-xl p-5 mb-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Staff nicknames are here!"
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="What's new? Mention the feature and that it came from user feedback."
              maxLength={500}
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground text-right">{form.message.length}/500</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="link">
                Link <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="link"
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://…"
                type="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkLabel">
                Link label <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="linkLabel"
                value={form.linkLabel}
                onChange={(e) => setForm((f) => ({ ...f, linkLabel: e.target.value }))}
                placeholder="Learn more"
                maxLength={50}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiresAt">
              Expires <span className="text-muted-foreground">(optional — leave blank to keep until deleted)</span>
            </Label>
            <Input
              id="expiresAt"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              type="datetime-local"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="xiv-cta w-full" disabled={submitting}>
            {submitting ? "Publishing…" : "Publish announcement"}
          </Button>
        </form>
      )}

      {announcements.length === 0 ? (
        <div className="xiv-card rounded-xl p-12 text-center text-muted-foreground text-sm">No announcements yet.</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="xiv-card rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{a.title}</p>
                  {a.expiresAt && new Date(a.expiresAt) < new Date() && (
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 border border-zinc-500/25">
                      Expired
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{a.message}</p>
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--xiv-blue)] hover:underline mt-1 inline-block"
                  >
                    {a.linkLabel ?? a.link}
                  </a>
                )}
                <p className="text-xs text-[var(--fg-faint)] mt-2">
                  {format(new Date(a.createdAt), "d MMM yyyy")}
                  {a.expiresAt && ` · expires ${format(new Date(a.expiresAt), "d MMM yyyy")}`}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-[var(--fg-faint)] hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes it for everyone immediately. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(a.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
