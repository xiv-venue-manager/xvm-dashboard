"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"

export function TeamEditLink() {
  const { status } = useSession()
  const [onTeam, setOnTeam] = useState(false)

  useEffect(() => {
    if (status !== "authenticated") return
    let live = true
    fetch("/api/team/profile")
      .then((res) => {
        if (live && res.ok) setOnTeam(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [status])

  if (!onTeam) return null
  return (
    <Link
      href="/team/edit"
      className="inline-flex items-center rounded-lg border border-[var(--blue-035)] bg-[var(--blue-010)] px-4 py-2 text-sm text-[var(--xiv-blue)] transition-colors hover:bg-[var(--blue-015)]"
    >
      Edit my card
    </Link>
  )
}
