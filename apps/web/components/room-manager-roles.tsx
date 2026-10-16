"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

type Role = {
  id: string
  name: string
}

export function RoomManagerRoles({
  venueId,
  venueSlug,
  canManage,
  initialRoleIds = [],
}: {
  venueId: string
  venueSlug: string
  canManage: boolean
  initialRoleIds?: string[]
}) {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(initialRoleIds))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/venues/${venueSlug}/roles`)
      .then((r) => r.json())
      .then((data) => setRoles(data.roles ?? []))
      .catch(() => {})
  }, [venueSlug])

  const toggleRole = (roleId: string) => {
    const next = new Set(selectedRoleIds)
    if (next.has(roleId)) next.delete(roleId)
    else next.add(roleId)
    setSelectedRoleIds(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      await fetch(`/api/venues/${venueId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomManagerRoleIds: Array.from(selectedRoleIds) }),
      })
    } finally {
      setSaving(false)
    }
  }

  if (!canManage || roles.length === 0) return null

  return (
    <div className="panel mt-4">
      <h3 className="text-sm font-semibold mb-2">Room Manager Roles</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Staff with these roles can lock/disable rooms from the plugin (OWNER and MANAGER always have access).
      </p>
      <div className="flex flex-wrap gap-3 mb-3">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Checkbox checked={selectedRoleIds.has(role.id)} onCheckedChange={() => toggleRole(role.id)} />
            {role.name}
          </label>
        ))}
      </div>
      <Button size="sm" disabled={saving} onClick={save}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  )
}
