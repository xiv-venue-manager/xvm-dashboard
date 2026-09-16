"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Badge } from "@/components/ui/badge"
import { PageLoading } from "@/components/ui/loading-spinner"
import { VenueLayoutClient } from "@/components/venue-layout-client"

// Preset colors for quick selection
const PRESET_COLORS = [
  "#6366f1", // Indigo (default)
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#3b82f6", // Blue
  "#6b7280", // Gray
]

interface Role {
  id: string
  name: string
  responsibilities: string | null
  color: string | null
  permissions: any
  hourlyRate: string | null
  potPayoutMode: "STANDARD" | "POT" | "CONTRACTOR"
  contractorSharesPot: boolean
  _count?: {
    memberships: number
  }
}

export default function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [potModeEnabled, setPotModeEnabled] = useState(false)

  // Form state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    responsibilities: "",
    color: "#6366f1",
    hourlyRate: "",
    potPayoutMode: "STANDARD" as "STANDARD" | "POT" | "CONTRACTOR",
    contractorSharesPot: false,
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch roles
  useEffect(() => {
    if (!slug) return

    const fetchRoles = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Get roles
        const rolesResponse = await fetch(`/api/venues/${venue.id}/roles`)
        if (!rolesResponse.ok) throw new Error("Failed to fetch roles")

        const rolesData = await rolesResponse.json()
        setRoles(rolesData)

        const potSettingsResponse = await fetch(`/api/venues/${venue.id}/pot-settings`)
        if (potSettingsResponse.ok) {
          const potSettingsData = await potSettingsResponse.json()
          setPotModeEnabled(potSettingsData.settings?.enabled ?? false)
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load roles")
      } finally {
        setIsLoading(false)
      }
    }

    fetchRoles()
  }, [slug])

  const handleCreateRole = async () => {
    if (!formData.name.trim()) {
      setFormError("Role name is required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create role")
      }

      const newRole = await response.json()
      setRoles([newRole, ...roles])
      setIsCreateDialogOpen(false)
      setFormData({
        name: "",
        responsibilities: "",
        color: "#6366f1",
        hourlyRate: "",
        potPayoutMode: "STANDARD",
        contractorSharesPot: false,
      })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to create role")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditRole = async () => {
    if (!editingRole || !formData.name.trim()) {
      setFormError("Role name is required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/roles/${editingRole.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update role")
      }

      const updatedRole = await response.json()
      setRoles(roles.map((r) => (r.id === updatedRole.id ? updatedRole : r)))
      setIsEditDialogOpen(false)
      setEditingRole(null)
      setFormData({
        name: "",
        responsibilities: "",
        color: "#6366f1",
        hourlyRate: "",
        potPayoutMode: "STANDARD",
        contractorSharesPot: false,
      })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update role")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRole = async (role: Role) => {
    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/roles/${role.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete role")
      }

      setRoles(roles.filter((r) => r.id !== role.id))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete role")
    }
  }

  const openEditDialog = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      responsibilities: role.responsibilities || "",
      color: role.color || "#6366f1",
      hourlyRate: role.hourlyRate ?? "",
      potPayoutMode: role.potPayoutMode ?? "STANDARD",
      contractorSharesPot: role.contractorSharesPot ?? false,
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }

  const openCreateDialog = () => {
    setFormData({
      name: "",
      responsibilities: "",
      color: "#6366f1",
      hourlyRate: "",
      potPayoutMode: "STANDARD",
      contractorSharesPot: false,
    })
    setFormError("")
    setIsCreateDialogOpen(true)
  }

  if (!slug) {
    return (
      <VenueLayoutClient slug="">
        <div className="page-inner">
          <PageLoading />
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="page-h1">Custom Roles</h1>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/${slug}/staff`}>← Back to Staff</Link>
            </Button>
            <Button onClick={openCreateDialog}>Create Role</Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Roles List */}
        {isLoading ? (
          <PageLoading text="Loading roles..." />
        ) : roles.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">No custom roles yet. Create one to organize your staff!</p>
              <Button onClick={openCreateDialog}>Create Your First Role</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: role.color || "#6366f1" }}
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="truncate">{role.name}</CardTitle>
                        <CardDescription className="mt-2">
                          {role.responsibilities || "No responsibilities specified"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <Badge variant="outline">
                        {role._count?.memberships || 0} {(role._count?.memberships || 0) === 1 ? "member" : "members"}
                      </Badge>
                      {role.hourlyRate && (
                        <Badge variant="outline">{Number(role.hourlyRate).toLocaleString("en-US")}/hr</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(role)}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={(role._count?.memberships || 0) > 0}>
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Role?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{role.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteRole(role)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {(role._count?.memberships || 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Cannot delete: Role is assigned to staff</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Role Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Custom Role</DialogTitle>
              <DialogDescription>Add a new custom role for your staff members</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="create-name">Role Name</Label>
                <Input
                  id="create-name"
                  placeholder="e.g., Bartender, DJ, Security"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-responsibilities">Responsibilities (Optional)</Label>
                <Textarea
                  id="create-responsibilities"
                  placeholder="What does this role do?"
                  value={formData.responsibilities}
                  onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-hourly-rate">Hourly Rate (Optional)</Label>
                <Input
                  id="create-hourly-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Used as this role's default pay rate"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              {potModeEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="create-payout-mode">Pot Payroll Mode</Label>
                    <Select
                      value={formData.potPayoutMode}
                      onValueChange={(v) =>
                        setFormData({ ...formData, potPayoutMode: v as typeof formData.potPayoutMode })
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="create-payout-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">Standard (unaffected by pot payroll)</SelectItem>
                        <SelectItem value="POT">Pot (shares equally in the pot split)</SelectItem>
                        <SelectItem value="CONTRACTOR">Contractor (own priced services)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.potPayoutMode === "CONTRACTOR" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="create-contractor-shares-pot"
                        checked={formData.contractorSharesPot}
                        onChange={(e) => setFormData({ ...formData, contractorSharesPot: e.target.checked })}
                        disabled={isSubmitting}
                      />
                      <Label htmlFor="create-contractor-shares-pot">Also shares in the pot split</Label>
                    </div>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label>Role Color</Label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          formData.color === color
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                        disabled={isSubmitting}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      disabled={isSubmitting}
                      className="w-10 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={formData.color.toUpperCase()}
                      onChange={(e) => {
                        const val = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value
                        if (/^#[0-9A-Fa-f]{6}$/.test(val)) setFormData({ ...formData, color: val.toLowerCase() })
                      }}
                      disabled={isSubmitting}
                      maxLength={7}
                      className="w-24 font-mono text-sm"
                      placeholder="#6366F1"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">Preview:</span>
                  <Badge
                    style={{
                      backgroundColor: formData.color,
                      color: "#fff",
                    }}
                  >
                    {formData.name || "Role Name"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleCreateRole} disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>Update the role name, description, and color</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Role Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-responsibilities">Responsibilities (Optional)</Label>
                <Textarea
                  id="edit-responsibilities"
                  value={formData.responsibilities}
                  onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-hourly-rate">Hourly Rate (Optional)</Label>
                <Input
                  id="edit-hourly-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              {potModeEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-payout-mode">Pot Payroll Mode</Label>
                    <Select
                      value={formData.potPayoutMode}
                      onValueChange={(v) =>
                        setFormData({ ...formData, potPayoutMode: v as typeof formData.potPayoutMode })
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="edit-payout-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">Standard (unaffected by pot payroll)</SelectItem>
                        <SelectItem value="POT">Pot (shares equally in the pot split)</SelectItem>
                        <SelectItem value="CONTRACTOR">Contractor (own priced services)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.potPayoutMode === "CONTRACTOR" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-contractor-shares-pot"
                        checked={formData.contractorSharesPot}
                        onChange={(e) => setFormData({ ...formData, contractorSharesPot: e.target.checked })}
                        disabled={isSubmitting}
                      />
                      <Label htmlFor="edit-contractor-shares-pot">Also shares in the pot split</Label>
                    </div>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label>Role Color</Label>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          formData.color === color
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                        disabled={isSubmitting}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      disabled={isSubmitting}
                      className="w-10 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={formData.color.toUpperCase()}
                      onChange={(e) => {
                        const val = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value
                        if (/^#[0-9A-Fa-f]{6}$/.test(val)) setFormData({ ...formData, color: val.toLowerCase() })
                      }}
                      disabled={isSubmitting}
                      maxLength={7}
                      className="w-24 font-mono text-sm"
                      placeholder="#6366F1"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">Preview:</span>
                  <Badge
                    style={{
                      backgroundColor: formData.color,
                      color: "#fff",
                    }}
                  >
                    {formData.name || "Role Name"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleEditRole} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </VenueLayoutClient>
  )
}
