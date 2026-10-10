"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ServerTime } from "@/components/server-time"

interface LinkedPlugin {
  id: number
  name: string
  preview: string
  issuedAt: string
  lastUsedAt: string | null
}

interface IssuedCode {
  code: string
  expiresAt: string
}

async function fetchLinked(): Promise<LinkedPlugin[]> {
  const res = await fetch("/api/plugin/credentials")
  return res.ok ? ((await res.json()).credentials ?? []) : []
}

export function PluginLinkCard() {
  const [linked, setLinked] = useState<LinkedPlugin[]>([])
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchLinked().then(setLinked)
  }, [])

  async function generate() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/plugin/pairing-codes", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not create a link code")
      setIssued({ code: data.code, expiresAt: data.expiresAt })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a link code")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: number) {
    setError("")
    const res = await fetch(`/api/plugin/credentials/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setError("Could not unlink that plugin")
      return
    }
    setLinked(await fetchLinked())
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Link the plugin</CardTitle>
        <CardDescription>
          Generate a one-time code, then enter it in the plugin under Settings, Account link. One link covers every
          venue you work at.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={generate} disabled={busy}>
          {busy ? "Creating…" : "Generate link code"}
        </Button>

        {issued && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-sm text-muted-foreground">
              Enter this code in the plugin. It works once and expires at{" "}
              <ServerTime date={issued.expiresAt} formatStr="time" /> (ST).
            </p>
            <p className="mt-2 select-all font-mono text-2xl tracking-widest">{issued.code}</p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium">Linked plugins</h3>
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plugin is linked yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {linked.map((plugin) => (
                <li key={plugin.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {plugin.name} <span className="font-mono text-muted-foreground">…{plugin.preview}</span>
                    <span className="ml-2 text-muted-foreground">
                      linked <ServerTime date={plugin.issuedAt} formatStr="datetime" />
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => revoke(plugin.id)}>
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
