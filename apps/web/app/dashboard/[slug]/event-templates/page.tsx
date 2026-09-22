"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, Trash2, Edit, Plus, ClipboardList } from "lucide-react"
import { canManageVenue } from "@/lib/roles"

interface EventTemplate {
  id: string
  name: string
  title: string
  description: string | null
  eventType: string
  timezone: string
  defaultStartTime: string
  defaultEndTime: string
  createdBy: {
    id: string
    name: string | null
    displayName: string | null
  } | null
}

const eventTypeLabels: Record<string, string> = {
  PERFORMANCE: "Performance",
  GAME_NIGHT: "Game Night",
  SPECIAL: "Special Event",
  SOCIAL: "Social",
  PRIVATE: "Private",
  OTHER: "Other",
}

export default function EventTemplatesPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [venueId, setVenueId] = useState<string>("")
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EventTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<EventTemplate | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    title: "",
    description: "",
    eventType: "OTHER",
    timezone: "UTC",
    defaultStartTime: "19:00",
    defaultEndTime: "22:00",
  })

  const fetchTemplates = async () => {
    try {
      const venueResponse = await fetch(`/api/venues`)
      if (!venueResponse.ok) throw new Error("Failed to fetch venue")

      const venues = await venueResponse.json()
      const venue = venues.find(
        (v: { slug: string; memberships: { role: string }[] }) => v.slug === slug
      )
      if (!venue) throw new Error("Venue not found")
      setVenueId(venue.id)
      setUserRole(venue.memberships?.[0]?.role ?? null)

      const response = await fetch(`/api/venues/${venue.id}/event-templates`)
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
    }
  }, [status, router])

  useEffect(() => {
    if (session && slug) {
      // Genuine data fetch (sets templates/loading state), not derivable from props/state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTemplates()
    }
  }, [session, slug])

  const handleCreate = async () => {
    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/event-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create template")
      }

      setIsCreateDialogOpen(false)
      resetForm()
      fetchTemplates()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to create template")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingTemplate) return

    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/event-templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update template")
      }

      setEditingTemplate(null)
      resetForm()
      fetchTemplates()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to update template")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingTemplate) return

    try {
      const response = await fetch(`/api/venues/${venueId}/event-templates/${deletingTemplate.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete template")
      }

      setDeletingTemplate(null)
      fetchTemplates()
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete template")
    }
  }

  const openCreateDialog = () => {
    resetForm()
    setIsCreateDialogOpen(true)
  }

  const openEditDialog = (template: EventTemplate) => {
    setFormData({
      name: template.name,
      title: template.title,
      description: template.description || "",
      eventType: template.eventType,
      timezone: template.timezone,
      defaultStartTime: template.defaultStartTime,
      defaultEndTime: template.defaultEndTime,
    })
    setEditingTemplate(template)
  }

  const resetForm = () => {
    setFormData({
      name: "",
      title: "",
      description: "",
      eventType: "OTHER",
      timezone: "UTC",
      defaultStartTime: "19:00",
      defaultEndTime: "22:00",
    })
    setError("")
  }

  const formatTimeRange = (startTime: string, endTime: string) => {
    return `${startTime} - ${endTime}`
  }

  if (loading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <div className="animate-pulse">Loading templates...</div>
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Event Templates</h1>
          </div>
          {canManageVenue(userRole) && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          )}
        </div>

        {/* Templates Grid */}
        {templates.length === 0 ? (
          <div className="xiv-card rounded-xl py-16 text-center space-y-4">
            <ClipboardList className="h-12 w-12 text-[var(--xiv-blue)] mx-auto opacity-50" />
            <div>
              <p className="font-cinzel font-semibold tracking-wide">No Templates Yet</p>
              <p className="text-sm text-muted-foreground mt-1">Save time by templating your recurring events.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="mt-1">{template.title}</CardDescription>
                    </div>
                    {canManageVenue(userRole) && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeletingTemplate(template)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{eventTypeLabels[template.eventType]}</Badge>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Clock className="mr-1 h-3 w-3" />
                        {formatTimeRange(template.defaultStartTime, template.defaultEndTime)}
                      </div>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                    )}
                    {template.createdBy && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Created by {template.createdBy.displayName || template.createdBy.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={isCreateDialogOpen || editingTemplate !== null}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false)
              setEditingTemplate(null)
              resetForm()
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
              <DialogDescription>Save time by creating reusable templates for recurring events</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Weekly Trivia Night"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">Internal name to identify this template</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Event Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Trivia Night at The Golden Saucer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  This will be the event title when creating from template
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Event description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventType">Event Type *</Label>
                <Select
                  value={formData.eventType}
                  onValueChange={(value) => setFormData({ ...formData, eventType: value })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERFORMANCE">Performance</SelectItem>
                    <SelectItem value="GAME_NIGHT">Game Night</SelectItem>
                    <SelectItem value="SPECIAL">Special Event</SelectItem>
                    <SelectItem value="SOCIAL">Social</SelectItem>
                    <SelectItem value="PRIVATE">Private</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Default Start Time *</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.defaultStartTime}
                    onChange={(e) => setFormData({ ...formData, defaultStartTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">Time in 24-hour format (e.g., 19:00)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">Default End Time *</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.defaultEndTime}
                    onChange={(e) => setFormData({ ...formData, defaultEndTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">Time in 24-hour format (e.g., 22:00)</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false)
                  setEditingTemplate(null)
                  resetForm()
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={editingTemplate ? handleUpdate : handleCreate}
                disabled={
                  isSubmitting ||
                  !formData.name ||
                  !formData.title ||
                  !formData.defaultStartTime ||
                  !formData.defaultEndTime
                }
              >
                {isSubmitting
                  ? editingTemplate
                    ? "Updating..."
                    : "Creating..."
                  : editingTemplate
                    ? "Update Template"
                    : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deletingTemplate !== null} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{deletingTemplate?.name}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </VenueLayoutClient>
  )
}
