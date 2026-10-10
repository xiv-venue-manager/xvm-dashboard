"use client"

import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Save, LogOut, Trash2, Bell, Key } from "lucide-react"
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

export default function AccountSettingsPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [displayName, setDisplayName] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const [notifications, setNotifications] = useState({
    newFollower: false,
    eventRsvp: false,
    lowStaffCoverage: false,
    dailySummary: false,
  })


  // session loads asynchronously; seed the editable displayName field once it's available.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session?.user?.name) setDisplayName(session.user.name)
  }, [session])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/user/profile")
        if (res.ok) {
          const data = await res.json()
          const settings = data.settings as { notifications?: Record<string, boolean> } | undefined
          if (settings?.notifications) {
            setNotifications((prev) => ({ ...prev, ...settings.notifications }))
          }
        }
      } catch {
        // Profile load failed, use defaults
      }
    }
    loadProfile()
  }, [])

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          notifications,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to save")
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-inner" style={{ maxWidth: 740 }}>
      {/* Header */}
      <div className="head-row">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <Link
              href="/dashboard/account"
              className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)] hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Account
            </Link>
          </div>
          <h1 className="page-h1">Account Settings</h1>
        </div>
      </div>

      {/* Display name */}
      <div className="vcard overflow-hidden mt-8">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          Profile
        </div>
        <div className="pbody space-y-5">
          <div>
            <label className="field-label">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-background border border-[var(--blue-015)] rounded-[var(--radius-md)] px-[13px] py-[10px] text-[0.88rem] text-foreground outline-none focus:border-[var(--blue-035)] transition-colors"
            />
            <p className="field-hint">Shown in the user chip and dropdown.</p>
          </div>

          <div>
            <label className="field-label">Email</label>
            <input
              value={session?.user?.email ?? ""}
              disabled
              className="w-full bg-background border border-[var(--blue-008)] rounded-[var(--radius-md)] px-[13px] py-[10px] text-[0.88rem] text-muted-foreground outline-none opacity-60 cursor-not-allowed"
            />
            <p className="field-hint">Email is managed via your Discord login and cannot be changed here.</p>
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

          <button
            onClick={save}
            disabled={saving || !displayName.trim()}
            className="xiv-btn-shimmer xiv-cta flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="vcard overflow-hidden mt-6">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          <Bell className="w-4 h-4" />
          Notifications
        </div>
        <div className="pbody space-y-1">
          {[
            { key: "newFollower" as const, title: "New follower", desc: "When someone follows your venue." },
            { key: "eventRsvp" as const, title: "Event RSVPs", desc: "When a patron RSVPs to an event." },
            {
              key: "lowStaffCoverage" as const,
              title: "Low staff coverage",
              desc: "When an open shift is unfilled within 24h.",
            },
            { key: "dailySummary" as const, title: "Daily summary", desc: "A nightly recap of sales and attendance." },
          ].map(({ key, title, desc }) => (
            <div key={key} className="flex items-center justify-between py-3 px-1">
              <div>
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xs text-[var(--fg-faint)]">{desc}</div>
              </div>
              <button
                type="button"
                onClick={() => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`w-10 h-[22px] rounded-full transition-colors relative ${
                  notifications[key] ? "bg-[var(--xiv-blue)]" : "bg-[var(--blue-018)]"
                }`}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform ${
                    notifications[key] ? "left-[22px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>
          ))}
          <button
            onClick={save}
            disabled={saving}
            className="xiv-btn-shimmer xiv-cta flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Plugin */}
      <div className="vcard overflow-hidden mt-6">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          <Key className="w-4 h-4" />
          Plugin
        </div>
        <div className="pbody space-y-2">
          <p className="text-sm text-[var(--fg-faint)]">
            Link the Dalamud plugin to your account with a one-time code. One link covers every venue you work at.
          </p>
          <Link href="/dashboard/api-keys" className="text-xs text-[var(--xiv-blue)] hover:underline">
            Link the plugin →
          </Link>
        </div>
      </div>

      {/* xvm-api credentials */}
      <div className="vcard overflow-hidden mt-6">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          <Key className="w-4 h-4" />
          xvm-api Credentials
        </div>
        <div className="pbody">
          <Link href="/dashboard/account/xvm-credentials" className="text-xs text-[var(--xiv-blue)] hover:underline">
            Manage xvm-api credentials →
          </Link>
        </div>
      </div>

      {/* Sign out */}
      <div className="vcard overflow-hidden mt-6">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          Session
        </div>
        <div className="pbody">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[var(--blue-018)] text-foreground hover:bg-[var(--blue-007)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
          <p className="field-hint mt-2">Signs you out on this device.</p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="vcard overflow-hidden mt-6 border-[rgba(243,139,168,0.25)]">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[rgba(243,139,168,0.15)] font-semibold text-sm text-[var(--support-pink)]">
          Danger zone
        </div>
        <div className="pbody">
          <p className="text-[0.88rem] text-muted-foreground mb-4">
            Deleting your account is permanent. All your venues, events, sales and staff data will be removed.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[rgba(243,139,168,0.35)] text-[var(--support-pink)] bg-[rgba(243,139,168,0.06)] hover:bg-[rgba(243,139,168,0.12)] transition-colors">
                <Trash2 className="w-4 h-4" />
                Delete account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your account and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[var(--support-pink)] text-[#070b14] hover:bg-pink-400"
                  onClick={async () => {
                    await fetch("/api/user/account", { method: "DELETE" })
                    signOut({ callbackUrl: "/" })
                  }}
                >
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
