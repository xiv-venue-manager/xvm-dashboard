"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { LocalTime } from "@/components/server-time"
import { PluginLinkCard } from "@/components/plugin-link-card"

interface ApiKey {
  id: string
  key: string
  name: string
  createdAt: string
  lastUsedAt?: string | null
  revokedAt: string | null
  venue?: {
    id: string
    name: string
    slug: string
  } | null
}

interface Membership {
  role?: string
  status?: string
}

interface Venue {
  id: string
  name: string
  slug: string
  memberships?: Membership[]
}

export default function UnifiedApiKeysPage() {
  const [memberVenues, setMemberVenues] = useState<Venue[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  // Empty string means "account-wide" (all my venues).
  const [selectedVenueId, setSelectedVenueId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showKey, setShowKey] = useState<ApiKey | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function fetchData() {
    setIsLoading(true)
    setError("")
    try {
      const [venuesRes, keysRes] = await Promise.all([fetch("/api/venues"), fetch("/api/plugin/keys")])

      if (venuesRes.ok) {
        const venues: Venue[] = await venuesRes.json()
        const active = venues.filter((v) => v.memberships?.some((m) => m.status === "active"))
        setMemberVenues(active)
      }

      if (keysRes.ok) {
        const data = await keysRes.json()
        setApiKeys(data.keys || [])
      }
    } catch (err) {
      console.error("Failed to load API keys:", err)
      setError("Failed to load API keys")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Genuine data fetch (sets venues/keys/loading state), not derivable from props/state during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(""), 3000)
    return () => clearTimeout(t)
  }, [success])

  async function createApiKey() {
    if (!newKeyName.trim()) {
      setError("Please enter a name for the API key")
      return
    }

    setIsCreating(true)
    setError("")
    setSuccess("")

    try {
      const body: { name: string; venueId?: string } = {
        name: newKeyName.trim(),
      }
      if (selectedVenueId) body.venueId = selectedVenueId

      const res = await fetch("/api/plugin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (res.ok) {
        // The create response contains the unmasked key. Keep it in
        // showKey state so we can display it once, and prepend to the list.
        setApiKeys([data, ...apiKeys])
        setNewKeyName("")
        setSelectedVenueId("")
        setShowKey(data)
      } else {
        setError(data.error || "Failed to create API key")
      }
    } catch {
      setError("Failed to create API key")
    } finally {
      setIsCreating(false)
    }
  }

  async function revokeApiKey(keyId: string) {
    try {
      const res = await fetch(`/api/plugin/keys/${keyId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setApiKeys(apiKeys.map((k) => (k.id === keyId ? { ...k, revokedAt: new Date().toISOString() } : k)))
        setSuccess("API key revoked")
      } else {
        setError("Failed to revoke API key")
      }
    } catch {
      setError("Failed to revoke API key")
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setSuccess("Copied to clipboard")
  }

  if (isLoading) {
    return (
      <div className="page-inner">
        <p>Loading...</p>
      </div>
    )
  }

  const hasMemberVenues = memberVenues.length > 0

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "API Keys" }]} />

      <div className="mb-6 md:mb-8">
        <h1 className="page-h1">My API Keys</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
          Link the Venue Manager Dalamud plugin to your account with a one-time code. Older plugin versions use the API
          keys further down instead.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 border-emerald-500/40 bg-emerald-500/10">
          <AlertDescription className="text-emerald-300">{success}</AlertDescription>
        </Alert>
      )}

      <PluginLinkCard />

      {!hasMemberVenues ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Older plugin versions use API keys, which need you to be a member of at least one venue. Linking with a code
            above does not.{" "}
            <Link href="/venues/new" className="text-primary hover:underline">
              Create one now
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Create New Key */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Create an API key for an older plugin version</CardTitle>
              <CardDescription>The full key is shown only once - copy it immediately after creation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., My gaming PC"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isCreating) createApiKey()
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A label to help you remember where this key is installed.
                </p>
              </div>

              <div>
                <Label htmlFor="scope">Scope</Label>
                <select
                  id="scope"
                  value={selectedVenueId}
                  onChange={(e) => setSelectedVenueId(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All my venues (recommended - one key, works everywhere)</option>
                  {memberVenues.map((v) => (
                    <option key={v.id} value={v.id}>
                      Only: {v.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Account-wide keys automatically cover any venue you join later, at whatever role you hold there.
                  Venue-scoped keys limit the blast radius if a key is leaked.
                </p>
              </div>

              <Button onClick={createApiKey} disabled={isCreating}>
                {isCreating ? "Creating..." : "Generate Key"}
              </Button>
            </CardContent>
          </Card>

          {/* Show newly created key + Dalamud setup instructions */}
          {showKey && (
            <Card className="mb-6 border-emerald-500/50 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="text-emerald-300">Copy your API key now</CardTitle>
                <CardDescription className="text-emerald-200/80">
                  This is the only time the full key will ever be shown. If you lose it, revoke it and generate a new
                  one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={showKey.key} readOnly className="font-mono" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" onClick={() => copyToClipboard(showKey.key)}>
                    Copy
                  </Button>
                  <Button variant="ghost" onClick={() => setShowKey(null)}>
                    Done
                  </Button>
                </div>

                <div className="rounded-md border border-emerald-500/30 bg-background p-4 space-y-3">
                  <div className="text-sm font-semibold text-emerald-300">Next: Set up the Venue Manager plugin</div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                      First time? Install the plugin (click to expand)
                    </summary>
                    <ol className="list-decimal list-inside space-y-1 mt-2 pl-2">
                      <li>
                        In FFXIV, open Dalamud settings with{" "}
                        <code className="bg-muted text-foreground px-1 rounded">/xlsettings</code>
                      </li>
                      <li>
                        Go to the <span className="font-medium text-foreground">Experimental</span> tab
                      </li>
                      <li>
                        Under <span className="font-medium text-foreground">Custom Plugin Repositories</span>, paste:
                      </li>
                    </ol>
                    <div className="flex gap-2 mt-2">
                      <Input
                        readOnly
                        value="https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json"
                        className="font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            "https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json"
                          )
                        }
                      >
                        Copy
                      </Button>
                    </div>
                    <ol start={4} className="list-decimal list-inside space-y-1 mt-2 pl-2">
                      <li>
                        Tick the enable checkbox next to the URL, then click{" "}
                        <span className="font-medium text-foreground">Save and Close</span>
                      </li>
                      <li>
                        Open <code className="bg-muted text-foreground px-1 rounded">/xlplugins</code>, search for{" "}
                        <span className="font-medium text-foreground">Venue Manager</span>, and install it
                      </li>
                    </ol>
                  </details>
                  <div>
                    <div className="text-xs font-semibold text-emerald-300 mb-1">Connect your key</div>
                    <ol className="text-sm text-foreground list-decimal list-inside space-y-1">
                      <li>
                        In-game, type <code className="bg-muted px-1 rounded">/xvenue</code> to open the plugin window
                      </li>
                      <li>
                        Switch to the <span className="font-medium">Settings</span> tab and scroll to{" "}
                        <span className="font-medium">XIV-App Sync</span>
                      </li>
                      <li>
                        Tick <span className="font-medium">Enable XIV-App Sync</span>, then paste the API key above into
                        the <span className="font-medium">API Key</span> field
                      </li>
                      <li>
                        Click <span className="font-medium">Fetch Venues</span> and pick{" "}
                        {showKey.venue ? (
                          <span className="font-medium">{showKey.venue.name}</span>
                        ) : (
                          <>any of your venues - this key works for all of them</>
                        )}
                      </li>
                      <li>Visits will now sync automatically. Come back here any time to revoke this key.</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing Keys */}
          <Card>
            <CardHeader>
              <CardTitle>Active Keys</CardTitle>
              <CardDescription>All your active keys across every venue</CardDescription>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No API keys yet. Create one above to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        key.revokedAt ? "bg-muted/40 opacity-60" : "bg-muted/20"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{key.name}</span>
                          {key.venue ? (
                            <Badge variant="secondary">{key.venue.name}</Badge>
                          ) : (
                            <Badge variant="outline" className="border-sky-500/40 text-sky-300">
                              All venues
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground font-mono truncate">{key.key}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Created: <LocalTime date={key.createdAt} formatStr="datewithyear" />
                          {key.lastUsedAt && (
                            <>
                              {" • Last used: "}
                              <LocalTime date={key.lastUsedAt} formatStr="datewithyear" />
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {key.revokedAt ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Any plugin installation using it will stop working immediately. This cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => revokeApiKey(key.id)}>Revoke</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="mt-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
