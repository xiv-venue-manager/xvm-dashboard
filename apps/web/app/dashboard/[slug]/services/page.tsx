"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RoleBadge } from "@/components/role-badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { PageLoading } from "@/components/ui/loading-spinner"
import { ItemSearchCombobox } from "@/components/item-search-combobox"

interface Role {
  id: string
  name: string
  color: string
}

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  category?: string | null
  isActive: boolean
  roles?: Role[]
  _count?: {
    transactions: number
  }
  linkedItemId?: number | null
  linkedItemName?: string | null
  linkedItemIcon?: number | null
  stockCount?: number | null
}

export default function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [venueId, setVenueId] = useState<string>("")
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  // Form state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    selectedRoleIds: [] as string[],
    isActive: true,
    linkedItem: null as { itemId: number; name: string; iconId: number | null } | null,
    stockCount: "" as string,
  })
  const [formError, setFormError] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [roleFilter, setRoleFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch services
  useEffect(() => {
    if (!slug) return

    const fetchServices = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")
        setVenueId(venue.id)

        // Get services, roles, and inventory settings
        const [servicesResponse, rolesResponse] = await Promise.all([
          fetch(`/api/venues/${venue.id}/services`),
          fetch(`/api/venues/${venue.id}/roles`),
          fetch(`/api/venues/${venue.id}/inventory-settings`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data) setInventoryEnabled(data.settings.enabled)
            }),
        ])

        if (!servicesResponse.ok) throw new Error("Failed to fetch services")
        if (!rolesResponse.ok) throw new Error("Failed to fetch roles")

        const servicesData = await servicesResponse.json()
        const rolesData = await rolesResponse.json()
        setServices(servicesData)
        setRoles(rolesData)
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load services")
      } finally {
        setIsLoading(false)
      }
    }

    fetchServices()
  }, [slug])

  const handleCreateService = async () => {
    if (!formData.name.trim() || !formData.price) {
      setFormError("Name and price are required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          category: formData.category || undefined,
          roleIds: formData.selectedRoleIds,
          isActive: formData.isActive,
          linkedItemId: formData.linkedItem?.itemId ?? null,
          linkedItemName: formData.linkedItem?.name ?? null,
          linkedItemIcon: formData.linkedItem?.iconId ?? null,
          stockCount: formData.stockCount.trim() === "" ? null : parseInt(formData.stockCount, 10),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create service")
      }

      const newService = await response.json()
      setServices([newService, ...services])
      setIsCreateDialogOpen(false)
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "",
        selectedRoleIds: [] as string[],
        isActive: true,
        linkedItem: null,
        stockCount: "",
      })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to create service")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditService = async () => {
    if (!editingService || !formData.name.trim() || !formData.price) {
      setFormError("Name and price are required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/services/${editingService.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          category: formData.category || undefined,
          roleIds: formData.selectedRoleIds,
          isActive: formData.isActive,
          linkedItemId: formData.linkedItem?.itemId ?? null,
          linkedItemName: formData.linkedItem?.name ?? null,
          linkedItemIcon: formData.linkedItem?.iconId ?? null,
          stockCount: formData.stockCount.trim() === "" ? null : parseInt(formData.stockCount, 10),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update service")
      }

      const updatedService = await response.json()
      setServices(services.map((s) => (s.id === updatedService.id ? updatedService : s)))
      setIsEditDialogOpen(false)
      setEditingService(null)
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "",
        selectedRoleIds: [] as string[],
        isActive: true,
        linkedItem: null,
        stockCount: "",
      })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update service")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteService = async (service: Service) => {
    try {
      const response = await fetch(`/api/venues/${venueId}/services/${service.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete service")
      }

      setServices(services.filter((s) => s.id !== service.id))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete service")
    }
  }

  const handleToggleService = async (service: Service) => {
    try {
      const response = await fetch(`/api/venues/${venueId}/services/${service.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !service.isActive }),
      })
      if (!response.ok) throw new Error("Failed to toggle service")
      const updated = await response.json()
      setServices(services.map((s) => (s.id === updated.id ? updated : s)))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to toggle service")
    }
  }

  const openEditDialog = (service: Service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || "",
      price: service.price.toString(),
      category: service.category ?? "",
      selectedRoleIds: service.roles?.map((r) => r.id) || [],
      isActive: service.isActive,
      linkedItem: service.linkedItemId
        ? { itemId: service.linkedItemId, name: service.linkedItemName ?? "", iconId: service.linkedItemIcon ?? null }
        : null,
      stockCount: service.stockCount != null ? String(service.stockCount) : "",
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }

  const openCreateDialog = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      category: "",
      selectedRoleIds: [] as string[],
      isActive: true,
      linkedItem: null,
      stockCount: "",
    })
    setFormError("")
    setIsCreateDialogOpen(true)
  }

  const toggleRoleSelection = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedRoleIds: prev.selectedRoleIds.includes(roleId)
        ? prev.selectedRoleIds.filter((id) => id !== roleId)
        : [...prev.selectedRoleIds, roleId],
    }))
  }

  if (!slug) {
    return (
      <div className="page-inner">
        <PageLoading />
      </div>
    )
  }

  const activeServices = services.filter((s) => s.isActive)
  const inactiveServices = services.filter((s) => !s.isActive)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="head-row">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Services</h1>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="sm:size-default self-start">
            <span className="hidden sm:inline">Add Service</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Total services"
              value={services.length}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              }
              iconVariant="blue"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Available"
              value={activeServices.length}
              deltaDirection="up"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
              iconVariant="success"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Unavailable"
              value={inactiveServices.length}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              }
              iconVariant="warning"
            />
          </Card>
        </div>

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Services List */}
        {isLoading ? (
          <PageLoading text="Loading services..." />
        ) : services.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">No services configured yet.</p>
              <Button onClick={openCreateDialog}>Add Your First Service</Button>
            </CardContent>
          </Card>
        ) : (
          <div>
            {/* Category filter tabs + role filter + search */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
                {["All", ...Array.from(new Set(services.map((s) => s.category).filter(Boolean) as string[]))].map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${categoryFilter === cat ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]" : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"}`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 h-9 px-3 rounded-full border border-[var(--blue-015)] bg-[var(--card)] text-sm font-medium text-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors flex-shrink-0">
                    <span className="max-w-[120px] truncate">
                      {roleFilter === "All" ? "All Roles" : roles.find((r) => r.id === roleFilter)?.name ?? "All Roles"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-faint)] flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px]">
                  <DropdownMenuItem
                    onClick={() => setRoleFilter("All")}
                    className={`flex items-center justify-between gap-2 cursor-pointer ${roleFilter === "All" ? "text-[var(--xiv-blue)]" : ""}`}
                  >
                    <span>All Roles</span>
                    {roleFilter === "All" && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </DropdownMenuItem>
                  {roles.map((role) => {
                    const count = services.filter((s) => s.roles?.some((r) => r.id === role.id)).length
                    return (
                      <DropdownMenuItem
                        key={role.id}
                        onClick={() => setRoleFilter(role.id)}
                        className={`flex items-center justify-between gap-2 cursor-pointer ${roleFilter === role.id ? "text-[var(--xiv-blue)]" : ""}`}
                      >
                        <RoleBadge role={role.name} color={role.color} />
                        <span className="text-[0.68rem] text-[var(--fg-faint)]">{count}</span>
                        {roleFilter === role.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="search">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Service catalogue — auto-fill 3-col grid matching prototype svc-grid */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(264px, 1fr))" }}>
              {services
                .filter((s) => roleFilter === "All" || s.roles?.some((r) => r.id === roleFilter))
                .filter((s) => categoryFilter === "All" || s.category === categoryFilter)
                .filter(
                  (s) =>
                    !search ||
                    s.name.toLowerCase().includes(search.toLowerCase()) ||
                    (s.description ?? "").toLowerCase().includes(search.toLowerCase())
                )
                .map((service) => (
                  <div
                    key={service.id}
                    className={`rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden transition-all duration-[250ms] hover:border-[rgba(0,180,255,0.45)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 flex flex-col gap-3 p-5 ${!service.isActive ? "opacity-50" : ""}`}
                  >
                    {/* Top: icon badge + name + category */}
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center flex-shrink-0 text-[var(--xiv-blue)]">
                        <svg
                          className="w-5 h-5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <path d="M16 10a4 4 0 0 1-8 0" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-[var(--font-outfit)] font-semibold text-base leading-tight">
                          {service.name}
                        </p>
                        <p className="text-[0.72rem] text-[var(--fg-faint)] mt-0.5">{service.category ?? "Service"}</p>
                      </div>
                      {service.stockCount != null && service.stockCount <= 5 && (
                        <Badge variant="destructive">
                          {service.stockCount === 0 ? "Out of stock" : `Low stock: ${service.stockCount}`}
                        </Badge>
                      )}
                    </div>
                    {/* Roles */}
                    {service.roles && service.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {service.roles.map((role) => (
                          <RoleBadge key={role.id} role={role.name} color={role.color} />
                        ))}
                      </div>
                    )}
                    {/* Description */}
                    {service.description ? (
                      <p className="text-[0.82rem] text-muted-foreground leading-relaxed flex-1">
                        {service.description}
                      </p>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {/* Footer: price + toggle + icon actions */}
                    <div className="flex items-center justify-between border-t border-[var(--blue-008)] pt-3">
                      <div>
                        <span className="font-[var(--font-outfit)] font-bold text-[1.1rem] text-[var(--xiv-blue)]">
                          {service.price > 0 ? service.price.toLocaleString("en-US") : "Free"}
                          {service.price > 0 && (
                            <span className="text-[0.72rem] text-muted-foreground font-medium ml-1">gil</span>
                          )}
                        </span>
                        {service._count && service._count.transactions > 0 && (
                          <p className="text-[0.68rem] text-emerald-400">{service._count.transactions} sales</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleService(service)}
                          title={service.isActive ? "Available" : "Unavailable"}
                          className={`relative w-[38px] h-[22px] rounded-full border transition-all duration-200 flex-shrink-0 ${service.isActive ? "bg-[var(--xiv-blue)] border-[var(--xiv-blue)]" : "bg-[var(--blue-010)] border-[var(--blue-020)]"}`}
                        >
                          <span
                            className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-all duration-200 ${service.isActive ? "translate-x-4 bg-[var(--xiv-navy)]" : "bg-[var(--fg-faint)]"}`}
                          />
                        </button>
                        {/* Edit */}
                        <button
                          onClick={() => openEditDialog(service)}
                          title="Edit"
                          className="text-[var(--fg-faint)] hover:text-[var(--xiv-blue)] transition-colors p-1 rounded"
                        >
                          <svg
                            className="w-4 h-4"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {/* Delete */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              title="Delete"
                              className="text-[var(--fg-faint)] hover:text-destructive transition-colors p-1 rounded"
                            >
                              <svg
                                className="w-4 h-4"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6m4-6v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete &quot;{service.name}&quot;?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteService(service)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Create Service Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add Service</DialogTitle>
              <DialogDescription>Create a new product or service for your venue</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="create-name">Service Name *</Label>
                <Input
                  id="create-name"
                  placeholder="e.g., House Special, VIP Pass"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-price">Price (gil) *</Label>
                <Input
                  id="create-price"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-category">Category</Label>
                <Input
                  id="create-category"
                  placeholder="e.g., Food & Drink, VIP, Entertainment"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label>Roles (who can provide this service)</Label>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles yet. Create roles first to assign services.</p>
                ) : (
                  <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`create-role-${role.id}`}
                          checked={formData.selectedRoleIds.includes(role.id)}
                          onCheckedChange={() => toggleRoleSelection(role.id)}
                          disabled={isSubmitting}
                        />
                        <Label htmlFor={`create-role-${role.id}`} className="flex items-center gap-2 cursor-pointer">
                          <RoleBadge role={role.name} color={role.color} />
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-description">Description</Label>
                <Textarea
                  id="create-description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="create-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  disabled={isSubmitting}
                />
                <Label htmlFor="create-active">Active (available for sale)</Label>
              </div>
              {inventoryEnabled && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Linked FFXIV Item (optional)</Label>
                  <ItemSearchCombobox
                    venueId={venueId}
                    value={formData.linkedItem}
                    onChange={(item) => setFormData({ ...formData, linkedItem: item })}
                  />
                  <Label>Stock Count (leave blank if not tracked)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.stockCount}
                    onChange={(e) => setFormData({ ...formData, stockCount: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleCreateService} disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Service Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
              <DialogDescription>Update service details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Service Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (gil) *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  placeholder="e.g., Food & Drink, VIP, Entertainment"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label>Roles (who can provide this service)</Label>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles yet. Create roles first to assign services.</p>
                ) : (
                  <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-role-${role.id}`}
                          checked={formData.selectedRoleIds.includes(role.id)}
                          onCheckedChange={() => toggleRoleSelection(role.id)}
                          disabled={isSubmitting}
                        />
                        <Label htmlFor={`edit-role-${role.id}`} className="flex items-center gap-2 cursor-pointer">
                          <RoleBadge role={role.name} color={role.color} />
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  disabled={isSubmitting}
                />
                <Label htmlFor="edit-active">Active (available for sale)</Label>
              </div>
              {inventoryEnabled && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Linked FFXIV Item (optional)</Label>
                  <ItemSearchCombobox
                    venueId={venueId}
                    value={formData.linkedItem}
                    onChange={(item) => setFormData({ ...formData, linkedItem: item })}
                  />
                  <Label>Stock Count (leave blank if not tracked)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.stockCount}
                    onChange={(e) => setFormData({ ...formData, stockCount: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleEditService} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </VenueLayoutClient>
  )
}
