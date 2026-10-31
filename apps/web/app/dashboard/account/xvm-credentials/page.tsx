"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LocalTime } from "@/components/server-time"

interface Credential {
  id: number
  name: string
  preview: string
  issued_at: string
  expires_at: string | null
  revoked_at: string | null
}

export default function XvmCredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const fetchIdRef = useRef(0)

  async function fetchCredentials() {
    const fetchId = ++fetchIdRef.current
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch("/api/xvm-api/credentials")
      if (fetchId !== fetchIdRef.current) return // superseded by a newer call
      if (res.ok) {
        setCredentials(await res.json())
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to load credentials")
      }
    } catch {
      if (fetchId === fetchIdRef.current) setError("Failed to load credentials")
    } finally {
      if (fetchId === fetchIdRef.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    // Resets loading/error/credentials for this mount's fetch, not derivable from props/state during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCredentials()
  }, [])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(""), 3000)
    return () => clearTimeout(t)
  }, [success])

  async function revoke(id: number) {
    try {
      const res = await fetch(`/api/xvm-api/credentials/${id}/revoke`, { method: "POST" })
      if (res.ok) {
        setSuccess("Credential revoked")
        fetchCredentials()
      } else {
        setError("Failed to revoke credential")
      }
    } catch {
      setError("Failed to revoke credential")
    }
  }

  if (isLoading) {
    return (
      <div className="page-inner">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "xvm-api Credentials" }]} />

      <div className="mb-6 md:mb-8">
        <h1 className="page-h1">xvm-api Credentials</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
          Credentials issued to your account by the xvm-api backend. Revoking one signs it out immediately.
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

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>All credentials linked to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No credentials found.</p>
          ) : (
            <div className="space-y-4">
              {credentials.map((cred) => (
                <div
                  key={cred.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    cred.revoked_at ? "bg-muted/40 opacity-60" : "bg-muted/20"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{cred.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono truncate">{cred.preview}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Issued: <LocalTime date={cred.issued_at} formatStr="datewithyear" />
                      {cred.expires_at && (
                        <>
                          {" • Expires: "}
                          <LocalTime date={cred.expires_at} formatStr="datewithyear" />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {cred.revoked_at ? (
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
                            <AlertDialogTitle>Revoke this credential?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => revoke(cred.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Revoke
                            </AlertDialogAction>
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

      <div className="mt-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
