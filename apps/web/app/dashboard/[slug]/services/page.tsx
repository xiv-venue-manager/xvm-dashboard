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
import { canManageVenue, isVenueOwner } from "@/lib/roles"
import { minorUnitsToDollars } from "@/lib/api/position-convert"

interface Role {
  id: number
  name: string
  color: string
}

interface Category {
  id: number
  name: string
  sort_order: number
}

interface ServiceInventory {
  linked_item_id: number
  linked_item_name: string | null
  linked_item_icon: number | null
  stock_count: number | null
}

interface Service {
  id: number
  name: string
  description: string | null
  price: number
  category_id: number | null
  isActive: boolean
  position_ids: number[]
  inventory: ServiceInventory | null
}

export default function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [venueId, setVenueId] = useState<string>("")
  const [userRole, setUserRole] = useState<string | null>(null)
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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
    categoryId: "" as string, // "" = no category
    selectedRoleIds: [] as number[],
    isActive: true,
    linkedItem: null as { itemId: number; name: string; iconId: number | null } | null,
    stockCount: "" as string,
  })
  const [newCategoryName, setNewCategoryName] = useState("")
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [formError, setFormError] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<number | "All">("All")
  const [roleFilter, setRoleFilter] = useState<number | "All">("All")
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
        const venue = venues.find((v: { slug: string; memberships: { role: string }[] }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")
        setVenueId(venue.id)
        setUserRole(venue.memberships?.[0]?.role ?? null)

        // Get services, roles, categories, and inventory settings
        const [servicesResponse, rolesResponse, categoriesResponse] = await Promise.all([
          fetch(`/api/venues/${venue.id}/services`),
          fetch(`/api/venues/${venue.id}/roles`),
          fetch(`/api/venues/${venue.id}/services/categories`),
          fetch(`/api/venues/${venue.id}/inventory-settings`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data) setInventoryEnabled(data.settings.enabled)
            }),
        ])

        if (!servicesResponse.ok) throw new Error("Failed to fetch services")
        if (!rolesResponse.ok) throw new Error("Failed to fetch roles")
        if (!categoriesResponse.ok) throw new Error("Failed to fetch categories")

        const servicesData: Array<{
          id: number
          name: string
          description: string | null
          price_minor: number | null
          category_id: number | null
          is_active: boolean
          position_ids: number[]
          inventory: ServiceInventory | null
        }> = await servicesResponse.json()
        const rolesData = await rolesResponse.json()
        const categoriesData = await categoriesResponse.json()
        setServices(
          servicesData.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            price: minorUnitsToDollars(s.price_minor) ?? 0,
            category_id: s.category_id,
            isActive: s.is_active,
            position_ids: s.position_ids,
            inventory: s.inventory,
          }))
        )
        setRoles(rolesData)
        setCategories(categoriesData)
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load services")
      } finally {
        setIsLoading(false)
      }
    }

    fetchServices()
  }, [slug])

  const emptyFormData = {
    name: "",
    description: "",
    price: "",
    categoryId: "",
    selectedRoleIds: [] as number[],
    isActive: true,
    linkedItem: null as { itemId: number; name: string; iconId: number | null } | null,
    stockCount: "",
  }

  function toServiceShape(row: {
    id: number
    name: string
    description: string | null
    price_minor: number | null
    category_id: number | null
    is_active: boolean
    position_ids: number[]
    inventory: ServiceInventory | null
  }): Service {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: minorUnitsToDollars(row.price_minor) ?? 0,
      category_id: row.category_id,
      isActive: row.is_active,
      position_ids: row.position_ids,
      inventory: row.inventory,
    }
  }

  // Positions are granted/revoked via separate endpoints, not bundled into the
  // service save — diff against what the service had before and fire only
  // the grants/revokes that changed.
  async function applyPositionChanges(serviceId: number, previousPositionIds: number[]) {
    const toGrant = formData.selectedRoleIds.filter((id) => !previousPositionIds.includes(id))
    const toRevoke = previousPositionIds.filter((id) => !formData.selectedRoleIds.includes(id))
    await Promise.all([
      ...toGrant.map((positionId) =>
        fetch(`/api/venues/${venueId}/services/${serviceId}/positions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionId }),
        })
      ),
      ...toRevoke.map((positionId) =>
        fetch(`/api/venues/${venueId}/services/${serviceId}/positions/${positionId}`, { method: "DELETE" })
      ),
    ])
  }

  // Inventory link is likewise a separate action from the service save. If a
  // stock count was entered alongside a newly-linked item, record it as an
  // initial "restock" movement — there is no direct set-stock endpoint wired
  // up to the dashboard yet.
  async function applyInventoryChanges(serviceId: number, previousLinkedItemId: number | null) {
    if (formData.linkedItem) {
      await fetch(`/api/venues/${venueId}/services/${serviceId}/inventory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedItemId: formData.linkedItem.itemId,
          linkedItemName: formData.linkedItem.name,
          linkedItemIcon: formData.linkedItem.iconId,
        }),
      })
      const stockCount = formData.stockCount.trim() === "" ? null : parseInt(formData.stockCount, 10)
      if (stockCount !== null && stockCount > 0) {
        await fetch(`/api/venues/${venueId}/services/${serviceId}/inventory/movements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "restock", delta: stockCount }),
        })
      }
    } else if (previousLinkedItemId !== null) {
      await fetch(`/api/venues/${venueId}/services/${serviceId}/inventory`, { method: "DELETE" })
    }
  }

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
          categoryId: formData.categoryId ? Number(formData.categoryId) : undefined,
          isActive: formData.isActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create service")
      }

      const created = await response.json()
      await applyPositionChanges(created.id, [])
      await applyInventoryChanges(created.id, null)

      // Re-fetch so the card reflects the positions/inventory just applied.
      const finalResponse = await fetch(`/api/venues/${venueId}/services/${created.id}`)
      const finalRow = finalResponse.ok ? await finalResponse.json() : created
      setServices([toServiceShape(finalRow), ...services])
      setIsCreateDialogOpen(false)
      setFormData(emptyFormData)
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          categoryId: formData.categoryId ? Number(formData.categoryId) : null,
          isActive: formData.isActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update service")
      }

      await response.json()
      await applyPositionChanges(editingService.id, editingService.position_ids)
      await applyInventoryChanges(editingService.id, editingService.inventory?.linked_item_id ?? null)

      const finalResponse = await fetch(`/api/venues/${venueId}/services/${editingService.id}`)
      const finalRow = finalResponse.ok ? await finalResponse.json() : null
      if (finalRow) {
        const updatedService = toServiceShape(finalRow)
        setServices(services.map((s) => (s.id === updatedService.id ? updatedService : s)))
      }
      setIsEditDialogOpen(false)
      setEditingService(null)
      setFormData(emptyFormData)
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !service.isActive }),
      })
      if (!response.ok) throw new Error("Failed to toggle service")
      const updated = await response.json()
      setServices(services.map((s) => (s.id === updated.id ? toServiceShape(updated) : s)))
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
      categoryId: service.category_id != null ? String(service.category_id) : "",
      selectedRoleIds: service.position_ids,
      isActive: service.isActive,
      linkedItem: service.inventory
        ? {
            itemId: service.inventory.linked_item_id,
            name: service.inventory.linked_item_name ?? "",
            iconId: service.inventory.linked_item_icon ?? null,
          }
        : null,
      stockCount: service.inventory?.stock_count != null ? String(service.inventory.stock_count) : "",
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }

  const openCreateDialog = () => {
    setFormData(emptyFormData)
    setFormError("")
    setIsCreateDialogOpen(true)
  }

  const toggleRoleSelection = (roleId: number) => {
    setFormData((prev) => ({
      ...prev,
      selectedRoleIds: prev.selectedRoleIds.includes(roleId)
        ? prev.selectedRoleIds.filter((id) => id !== roleId)
        : [...prev.selectedRoleIds, roleId],
    }))
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setIsCreatingCategory(true)
    try {
      const response = await fetch(`/api/venues/${venueId}/services/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create category")
      }
      const created: Category = await response.json()
      setCategories([...categories, created])
      setFormData((prev) => ({ ...prev, categoryId: String(created.id) }))
      setNewCategoryName("")
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to create category")
    } finally {
      setIsCreatingCategory(false)
    }
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
          {canManageVenue(userRole) && (
            <Button onClick={openCreateDialog} size="sm" className="sm:size-default self-start">
              <span className="hidden sm:inline">Add Service</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
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
              <p className="text-muted-foreground">No services configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div>
            {/* Category filter tabs + role filter + search */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
                <button
                  onClick={() => setCategoryFilter("All")}
                  className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${categoryFilter === "All" ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]" : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"}`}
                >
                  All
                </button>
                {categories
                  .filter((cat) => services.some((s) => s.category_id === cat.id))
                  .map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${categoryFilter === cat.id ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]" : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"}`}
                    >
                      {cat.name}
                    </button>
                  ))}
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
                    const count = services.filter((s) => s.position_ids.includes(role.id)).length
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
                .filter((s) => roleFilter === "All" || s.position_ids.includes(roleFilter))
                .filter((s) => categoryFilter === "All" || s.category_id === categoryFilter)
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
                        <p className="text-[0.72rem] text-[var(--fg-faint)] mt-0.5">
                          {categories.find((c) => c.id === service.category_id)?.name ?? "Service"}
                        </p>
                      </div>
                      {service.inventory?.stock_count != null && service.inventory.stock_count <= 5 && (
                        <Badge variant="destructive">
                          {service.inventory.stock_count === 0
                            ? "Out of stock"
                            : `Low stock: ${service.inventory.stock_count}`}
                        </Badge>
                      )}
                    </div>
                    {/* Roles */}
                    {service.position_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {service.position_ids.map((positionId) => {
                          const role = roles.find((r) => r.id === positionId)
                          return role ? <RoleBadge key={role.id} role={role.name} color={role.color} /> : null
                        })}
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
                          {service.price > 0 ? service.price.toLocaleString() : "Free"}
                          {service.price > 0 && (
                            <span className="text-[0.72rem] text-muted-foreground font-medium ml-1">gil</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canManageVenue(userRole) && (
                          <>
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
                          </>
                        )}
                        {/* Delete — OWNER only, matches the API */}
                        {isVenueOwner(userRole) && (
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
                                <AlertDialogAction onClick={() => handleDeleteService(service)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                          </AlertDialogContent>
                          </AlertDialog>
                        )}
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
                <select
                  id="create-category"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                >
                  <option value="">No category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name"
                    maxLength={50}
                    disabled={isSubmitting || isCreatingCategory}
                    className="flex-1 h-9 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting || isCreatingCategory || !newCategoryName.trim()}
                    onClick={handleCreateCategory}
                  >
                    {isCreatingCategory ? "Adding..." : "Add"}
                  </Button>
                </div>
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
                <select
                  id="edit-category"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  disabled={isSubmitting}
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                >
                  <option value="">No category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name"
                    maxLength={50}
                    disabled={isSubmitting || isCreatingCategory}
                    className="flex-1 h-9 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting || isCreatingCategory || !newCategoryName.trim()}
                    onClick={handleCreateCategory}
                  >
                    {isCreatingCategory ? "Adding..." : "Add"}
                  </Button>
                </div>
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
