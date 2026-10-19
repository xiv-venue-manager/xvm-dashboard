"use client"

import { useEffect, useState } from "react"
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

interface UserCharacter {
  id: string
  characterName: string
  world: string
  isPrimary: boolean
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<UserCharacter[]>([])
  const [name, setName] = useState("")
  const [world, setWorld] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function fetchCharacters(showLoading = true) {
    if (showLoading) setIsLoading(true)
    setError("")
    try {
      const res = await fetch("/api/user-characters")
      if (res.ok) {
        const data = await res.json()
        setCharacters(data.characters || [])
      } else {
        setError("Failed to load characters")
      }
    } catch {
      setError("Failed to load characters")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Genuine data fetch (sets characters/loading state), not derivable from props/state during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCharacters()
  }, [])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(""), 3000)
    return () => clearTimeout(t)
  }, [success])

  async function addCharacter() {
    const trimmedName = name.trim()
    const trimmedWorld = world.trim()
    if (!trimmedName || !trimmedWorld) {
      setError("Character name and world are required")
      return
    }

    setIsCreating(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch("/api/user-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: trimmedName,
          world: trimmedWorld,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setName("")
        setWorld("")
        setSuccess("Character linked")
        await fetchCharacters(false)
      } else {
        setError(data.error || "Failed to link character")
      }
    } catch {
      setError("Failed to link character")
    } finally {
      setIsCreating(false)
    }
  }

  async function removeCharacter(id: string) {
    try {
      const res = await fetch(`/api/user-characters/${id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setSuccess("Character unlinked")
        await fetchCharacters(false)
      } else {
        setError("Failed to unlink character")
      }
    } catch {
      setError("Failed to unlink character")
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
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Characters" }]} />

      <div className="mb-6 md:mb-8">
        <h1 className="page-h1">My Characters</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
          Link your FFXIV characters so the plugin can tell when you&apos;re working a shift versus visiting as a
          patron. When any of these characters arrive at a venue while you have an active shift, the visit is logged as
          staff presence. Otherwise it&apos;s logged as a patron visit.
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Link a character</CardTitle>
          <CardDescription>
            Name and world must match exactly as they appear in-game. Each character can only be linked to one account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="charName">Character name</Label>
              <Input
                id="charName"
                placeholder="e.g., Ehno Starborne"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) addCharacter()
                }}
              />
            </div>
            <div>
              <Label htmlFor="charWorld">World</Label>
              <Input
                id="charWorld"
                placeholder="e.g., Balmung"
                value={world}
                onChange={(e) => setWorld(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) addCharacter()
                }}
              />
            </div>
          </div>

          <Button onClick={addCharacter} disabled={isCreating}>
            {isCreating ? "Linking..." : "Link character"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked characters</CardTitle>
          <CardDescription>Characters currently linked to this account</CardDescription>
        </CardHeader>
        <CardContent>
          {characters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No characters linked yet. Link at least one so the plugin can identify you.
            </p>
          ) : (
            <ul className="space-y-3">
              {characters.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-border bg-[var(--card)] p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-medium">{c.characterName}</span>
                    <span className="text-muted-foreground text-sm">@ {c.world}</span>
                    {c.isPrimary && (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                        Primary
                      </Badge>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Unlink
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink {c.characterName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Past visits attributed to this character will remain as history, but new visits will be
                          logged as patron (not staff) unless you re-link.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeCharacter(c.id)}>Unlink</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
