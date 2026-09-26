"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { GalleryManager } from "@/components/gallery-manager"
import { FinanceCategoriesSettings } from "@/components/finance-categories-settings"
import { BannerUpload } from "@/components/banner-upload"
import { LogoUpload } from "@/components/logo-upload"
import type { VenueImage } from "@/lib/api/xvm-api"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { PageLoading } from "@/components/ui/loading-spinner"
import { LocalTime } from "@/components/server-time"
import type { VenueSettings } from "@xiv-venue-manager/types"
import type { ListingLinkRow, ListingSummary } from "@/lib/api/xvm-api"
import { FFXIV_DISTRICTS } from "@/lib/venue-location"
import { canManageVenue } from "@/lib/roles"

const SAVE_OFF_MESSAGE = "Saving is off: this venue's profile couldn't be loaded from xvm-api. Reload the page to try again."

export default function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [settings, setSettings] = useState<VenueSettings>({
    taskVisibility: "all",
    salesVisibility: "all",
    revenueVisibility: "all",
    eventVisibility: "all",
    discordWebhookUrl: "",
    webhooks: {
      taskCreated: false,
      taskCompleted: false,
      partakeEvent: false,
      saleLogged: false,
      dailySalesSummary: false,
      staffJoined: false,
    },
    discordWebhooks: {
      staff: "",
      events: "",
      revenue: "",
    },
    partakeTeamId: null,
    venueType: null,
  })
  // Venue profile DB fields (saved separately)
  const [venueName, setVenueName] = useState("")
  const [venueDescription, setVenueDescription] = useState("")
  const [venueDistrict, setVenueDistrict] = useState<string>("__none__")
  const [venueWard, setVenueWard] = useState<string>("")
  const [venuePlot, setVenuePlot] = useState<string>("")
  const [venueApartment, setVenueApartment] = useState<string>("")
  const [housingType, setHousingType] = useState<"house" | "apartment">("house")
  const [venueDataCenter, setVenueDataCenter] = useState("")
  const [venueWorld, setVenueWorld] = useState("")
  const [tagInput, setTagInput] = useState("")

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [xvmUnavailable, setXvmUnavailable] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState("")
  const [venueId, setVenueId] = useState<string>("")
  const [userRole, setUserRole] = useState<string>("")
  const [galleryImages, setGalleryImages] = useState<VenueImage[]>([])
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [ffxivLink, setFfxivLink] = useState<ListingLinkRow | null>(null)
  const [ffxivListings, setFfxivListings] = useState<ListingSummary[] | null>(null)
  const [ffxivSelected, setFfxivSelected] = useState("")
  const [ffxivLoading, setFfxivLoading] = useState(false)
  const [ffxivError, setFfxivError] = useState<string | null>(null)
  const [ffxivSyncing, setFfxivSyncing] = useState(false)
  const [ffxivUnlinking, setFfxivUnlinking] = useState(false)
  const [xvmApiVenueId, setXvmApiVenueId] = useState<string | null>(null)
  const [xvmApiVenueLinkedAt, setXvmApiVenueLinkedAt] = useState<string | null>(null)
  const [xvmConnecting, setXvmConnecting] = useState(false)
  const [xvmConnectError, setXvmConnectError] = useState<string | null>(null)
  const [froggeConnected, setFroggeConnected] = useState(false)
  const [froggeCode, setFroggeCode] = useState("")
  const [froggeConnecting, setFroggeConnecting] = useState(false)
  const [froggeError, setFroggeError] = useState<string | null>(null)
  const [froggeDisconnecting, setFroggeDisconnecting] = useState(false)
  const [shiftBotEnabled, setShiftBotEnabled] = useState(false)
  const [shiftBotChannelId, setShiftBotChannelId] = useState("")
  const [shiftBotDaysBefore, setShiftBotDaysBefore] = useState(3)
  const [shiftBotThumbnailUrl, setShiftBotThumbnailUrl] = useState("")
  const [potTaxPercent, setPotTaxPercent] = useState(0)
  const [potIncludeSalesInPot, setPotIncludeSalesInPot] = useState(false)
  const [potDefaultTipPooled, setPotDefaultTipPooled] = useState(false)
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [shiftBotTemplates, setShiftBotTemplates] = useState<
    Array<{
      name: string
      startOffsetHours: number
      durationHours: number
      slots: number
    }>
  >([])
  const [isDirty, setIsDirty] = useState(false)
  const settingsReadyRef = useRef(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch settings
  useEffect(() => {
    if (!slug) return

    const fetchSettings = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Set venue profile DB fields
        setVenueId(venue.id)
        setVenueDataCenter(venue.dataCenter ?? "")
        setVenueWorld(venue.world ?? "")
        fetch(`/api/venues/${venue.id}/gallery`)
          .then((res) => (res.ok ? res.json() : []))
          .then((images: VenueImage[]) => setGalleryImages(images))
          .catch(() => setGalleryImages([]))
        setXvmApiVenueId(venue.xvmApiVenueId ?? null)
        setXvmApiVenueLinkedAt(venue.xvmApiVenueLinkedAt ?? null)
        if (venue.memberships?.[0]) {
          setUserRole(venue.memberships[0].role)
        }

        // Get settings
        const settingsResponse = await fetch(`/api/venues/${venue.id}/settings`)
        if (!settingsResponse.ok) setXvmUnavailable(true)
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setXvmUnavailable(!!settingsData.visibilityDegraded)
          setVenueName(settingsData.name ?? "")
          setVenueDescription(settingsData.description ?? "")
          setVenueDistrict(settingsData.district ?? "__none__")
          setVenueWard(settingsData.ward != null ? String(settingsData.ward) : "")
          setVenuePlot(settingsData.plot != null ? String(settingsData.plot) : "")
          setVenueApartment(settingsData.apartment != null ? String(settingsData.apartment) : "")
          setHousingType(settingsData.apartment != null ? "apartment" : "house")
          setBannerUrl(settingsData.bannerUrl ?? null)
          setLogoUrl(settingsData.logoUrl ?? null)
          setSettings({
            ...settingsData,
            // Ensure discordWebhookUrl is never null
            discordWebhookUrl: settingsData.discordWebhookUrl || "",
            // Ensure webhooks object exists with defaults
            webhooks: settingsData.webhooks || {
              taskCreated: false,
              taskCompleted: false,
              partakeEvent: false,
              saleLogged: false,
              dailySalesSummary: false,
              staffJoined: false,
            },
            // Ensure discordWebhooks object exists with defaults
            discordWebhooks: settingsData.discordWebhooks || {
              staff: "",
              events: "",
              revenue: "",
            },
            partakeTeamId: settingsData.partakeTeamId ?? null,
            venueType: settingsData.venueType ?? null,
          })
          setFroggeConnected(!!settingsData.froggeToken)
          setShiftBotEnabled(settingsData.shiftBot?.enabled ?? false)
          setShiftBotChannelId(settingsData.shiftBot?.channelId ?? "")
          setShiftBotDaysBefore(settingsData.shiftBot?.daysBeforeEvent ?? 3)
          setShiftBotThumbnailUrl(settingsData.shiftBot?.thumbnailUrl ?? "")
          setShiftBotTemplates(settingsData.shiftBot?.templates ?? [])
        }

        loadPotSettings(venue.id)

        if (venue.xvmApiVenueId) {
          fetch(`/api/venues/${venue.id}/ffxivvenues`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: ListingLinkRow | null) => setFfxivLink(data && !data.unlinked_at ? data : null))
            .catch(() => setFfxivLink(null))
        }

        fetch(`/api/venues/${venue.id}/inventory-settings`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return
            setInventoryEnabled(data.settings.enabled)
          })
          .catch(() => {})
      } catch (error: unknown) {
        setXvmUnavailable(true)
        setError(error instanceof Error ? error.message : "Failed to load settings")
      } finally {
        setIsLoading(false)
        settingsReadyRef.current = true
      }
    }

    fetchSettings()
  }, [slug])

  useEffect(() => {
    if (!isLoading && !canManageVenue(userRole)) {
      router.replace(`/dashboard/${slug}`)
    }
  }, [isLoading, userRole, slug, router])

  useEffect(() => {
    if (!settingsReadyRef.current) return
    setIsDirty(true)
  }, [
    settings,
    venueName,
    venueDescription,
    venueDistrict,
    venueWard,
    venuePlot,
    venueApartment,
    housingType,
    shiftBotEnabled,
    shiftBotChannelId,
    shiftBotDaysBefore,
    shiftBotThumbnailUrl,
    shiftBotTemplates,
    potTaxPercent,
    potIncludeSalesInPot,
    potDefaultTipPooled,
    inventoryEnabled,
  ])

  const handleSave = async () => {
    if (xvmUnavailable) return
    setIsSaving(true)
    setError("")
    setSuccess(false)

    try {
      if (!venueId) throw new Error("Venue not loaded")

      // Save venue profile DB fields (name, description) via PATCH
      const profileRes = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: venueName.trim() || undefined,
          description: venueDescription || null,
          district: venueDistrict && venueDistrict !== "__none__" ? venueDistrict : null,
          ward: venueWard ? parseInt(venueWard, 10) : null,
          plot: housingType === "house" && venuePlot ? parseInt(venuePlot, 10) : null,
          apartment: housingType === "apartment" && venueApartment ? parseInt(venueApartment, 10) : null,
        }),
      })
      if (!profileRes.ok) {
        const d = await profileRes.json()
        throw new Error(d.error || "Failed to save venue profile")
      }

      // Save settings JSON (tagline, tags, hours, permissions, webhooks etc.)
      const settingsRes = await fetch(`/api/venues/${venueId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          shiftBot: {
            enabled: shiftBotEnabled,
            channelId: shiftBotChannelId,
            daysBeforeEvent: shiftBotDaysBefore,
            templates: shiftBotTemplates,
            thumbnailUrl: shiftBotThumbnailUrl || undefined,
          },
        }),
      })
      if (!settingsRes.ok) {
        const d = await settingsRes.json()
        throw new Error(d.error || "Failed to save settings")
      }

      // Save pot payroll settings (separate relational table, own route)
      const potSettingsRes = await fetch(`/api/venues/${venueId}/pot-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxPercent: potTaxPercent,
          includeSalesInPot: potIncludeSalesInPot,
          defaultTipPooled: potDefaultTipPooled,
        }),
      })
      if (!potSettingsRes.ok) {
        const d = await potSettingsRes.json()
        throw new Error(d.error || "Failed to save pot payroll settings")
      }

      // Save bar inventory tracking settings (separate relational table, own route)
      const inventorySettingsRes = await fetch(`/api/venues/${venueId}/inventory-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: inventoryEnabled,
        }),
      })
      if (!inventorySettingsRes.ok) {
        const d = await inventorySettingsRes.json()
        throw new Error(d.error || "Failed to save bar inventory settings")
      }

      setSuccess(true)
      setIsDirty(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteVenue = async () => {
    setIsDeleting(true)
    setError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete venue")
      }

      // Redirect to dashboard
      router.push("/dashboard")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to delete venue")
      setIsDeleting(false)
    }
  }

  async function handleFfxivLoadListings() {
    setFfxivLoading(true)
    setFfxivError(null)
    try {
      const res = await fetch("/api/ffxivvenues/mine")
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Failed to load your listings")
      setFfxivListings(body as ListingSummary[])
      setFfxivSelected((body as ListingSummary[])[0]?.id ?? "")
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to load your listings")
    } finally {
      setFfxivLoading(false)
    }
  }

  async function handleFfxivLink() {
    if (!ffxivSelected) return
    setFfxivLoading(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ffxivvenuesId: ffxivSelected }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Failed to link")
      window.location.reload()
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to link")
      setFfxivLoading(false)
    }
  }

  async function handleFfxivSyncNow() {
    setFfxivSyncing(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues/sync`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (res.status === 404 || res.status === 409) setFfxivLink(null)
      if (!res.ok) throw new Error(body?.error ?? "Sync failed")
      if (body?.unlinked) {
        setFfxivLink(null)
        return
      }
      setFfxivLink((prev) => (prev ? { ...prev, last_synced_at: body?.synced_at ?? new Date().toISOString() } : prev))
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setFfxivSyncing(false)
    }
  }

  async function handleFfxivUnlink() {
    setFfxivUnlinking(true)
    setFfxivError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/ffxivvenues`, { method: "DELETE" })
      if (!res.ok && res.status !== 204 && res.status !== 404) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to unlink")
      }
      setFfxivLink(null)
    } catch (e) {
      setFfxivError(e instanceof Error ? e.message : "Failed to unlink")
    } finally {
      setFfxivUnlinking(false)
    }
  }

  async function loadPotSettings(id: string) {
    const r = await fetch(`/api/venues/${id}/pot-settings`)
    if (!r.ok) return
    const data = await r.json()
    setPotTaxPercent(data.settings.taxPercent)
    setPotIncludeSalesInPot(data.settings.includeSalesInPot)
    setPotDefaultTipPooled(data.settings.defaultTipPooled)
  }

  async function handleXvmConnect() {
    setXvmConnecting(true)
    setXvmConnectError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/xvm-connect`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to connect")
      }
      const result = await res.json()
      setXvmApiVenueId(result.id)
      setXvmApiVenueLinkedAt(new Date().toISOString())
      loadPotSettings(venueId).catch(() => {})
    } catch (e) {
      setXvmConnectError(e instanceof Error ? e.message : "Failed to connect")
    } finally {
      setXvmConnecting(false)
    }
  }

  async function handleFroggeConnect() {
    if (!froggeCode.trim()) return
    setFroggeConnecting(true)
    setFroggeError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/frogge/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: froggeCode.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to connect")
      }
      setFroggeConnected(true)
      setFroggeCode("")
    } catch (e) {
      setFroggeError(e instanceof Error ? e.message : "Failed to connect")
    } finally {
      setFroggeConnecting(false)
    }
  }

  async function handleFroggeDisconnect() {
    setFroggeDisconnecting(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/frogge/disconnect`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to disconnect")
      setFroggeConnected(false)
    } finally {
      setFroggeDisconnecting(false)
    }
  }

  if (!slug || (isLoading && !userRole) || !canManageVenue(userRole)) {
    return (
      <div className="container mx-auto p-8">
        <PageLoading />
      </div>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner max-w-3xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Settings</h1>
          </div>
          <Button onClick={handleSave} disabled={isSaving || xvmUnavailable} className="self-start shrink-0">
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {/* Alerts */}
        {xvmUnavailable && (
          <Alert className="mb-4 bg-destructive/10 border-destructive/20">
            <AlertDescription>
              Couldn&apos;t load this venue&apos;s profile and staff visibility from xvm-api, so saving is turned off to
              avoid overwriting them with blanks. Reload the page to try again.
            </AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-4 bg-emerald-500/10 border-emerald-500/20">
            <AlertDescription className="text-emerald-400">Settings saved.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert className="mb-4 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <PageLoading text="Loading settings…" />
        ) : (
          <div className="stack mt-2">
            {/* ── Venue profile ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Venue profile
                </span>
              </div>
              <div className="pbody space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="venue-name">Venue name</Label>
                    <Input
                      id="venue-name"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input
                      id="tagline"
                      placeholder="e.g. A dockside tavern for wayward souls"
                      value={settings.tagline ?? ""}
                      onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-[var(--blue-015)] bg-background min-h-[42px] items-center">
                    {(settings.tags ?? []).map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium px-2.5 py-1 rounded-full bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-020)]"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({ ...settings, tags: (settings.tags ?? []).filter((t: string) => t !== tag) })
                          }
                          className="hover:text-destructive transition-colors text-[var(--fg-faint)]"
                        >
                          <svg
                            className="w-3 h-3"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <input
                      placeholder="Add tag…"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                          e.preventDefault()
                          const newTag = tagInput.trim().replace(/,$/, "")
                          if (newTag && !(settings.tags ?? []).includes(newTag)) {
                            setSettings({ ...settings, tags: [...(settings.tags ?? []), newTag] })
                          }
                          setTagInput("")
                        }
                        if (e.key === "Backspace" && !tagInput && (settings.tags ?? []).length) {
                          setSettings({ ...settings, tags: (settings.tags ?? []).slice(0, -1) })
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-[var(--fg-faint)]"
                    />
                  </div>
                  <p className="text-[0.68rem] text-[var(--fg-faint)]">
                    Press Enter or comma to add. e.g. 18+, Bar, RP, Live Music
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Venue logo</Label>
                  <p className="text-xs text-muted-foreground">
                    Square logo shown next to your venue in the mobile app. Upload or pick from your gallery photos.
                  </p>
                  {venueId && (
                    <LogoUpload
                      venueId={venueId}
                      initialUrl={logoUrl}
                      galleryImages={galleryImages.map((img) => img.image_url)}
                      onUpdate={setLogoUrl}
                    />
                  )}
                </div>
                <div className="border-t border-[var(--blue-015)]" />
                <div className="space-y-1.5">
                  <Label>Banner image</Label>
                  {venueId && <BannerUpload venueId={venueId} initialUrl={bannerUrl} onUpdate={setBannerUrl} />}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue-desc">Description</Label>
                  <textarea
                    id="venue-desc"
                    rows={3}
                    placeholder="Tell patrons what makes your venue special…"
                    value={venueDescription}
                    onChange={(e) => setVenueDescription(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-sm bg-background border border-[var(--blue-015)] focus:border-[var(--blue-035)] rounded-lg px-3 py-2 outline-none resize-y text-foreground placeholder:text-[var(--fg-faint)] transition-colors"
                  />
                </div>
              </div>
            </section>

            {/* ── Gallery ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Gallery
                </span>
              </div>
              <div className="pbody">
                <p className="text-xs text-[var(--fg-faint)] mb-4">
                  Upload photos of your venue. They appear on your public profile. Max 9 images, 10 MB each.
                </p>
                {venueId && <GalleryManager venueId={venueId} initialImages={galleryImages} />}
              </div>
            </section>

            {/* ── Opening Schedule ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Opening Schedule
                </span>
              </div>

              <div className="px-5 py-4 space-y-3">
                <p className="text-[0.82rem] text-[var(--fg-faint)]">
                  Opening hours moved to their own page.{" "}
                  <Link href={`/dashboard/${slug}/hours`} className="text-[var(--xiv-blue)] hover:opacity-80">
                    Manage opening hours
                  </Link>
                  .
                </p>
              </div>
            </section>

            {/* ── Location & hours ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Location &amp; hours
                </span>
              </div>
              <div className="pbody space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Data Centre &amp; World</Label>
                    <Input
                      value={venueDataCenter && venueWorld ? `${venueDataCenter} · ${venueWorld}` : ""}
                      disabled
                      className="bg-background border-[var(--blue-015)] opacity-50 cursor-not-allowed text-[var(--fg-faint)] font-mono text-sm"
                      placeholder="Set during venue creation"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={housingType === "house" ? "default" : "outline"}
                    size="sm"
                    disabled={isSaving}
                    onClick={() => setHousingType("house")}
                  >
                    House
                  </Button>
                  <Button
                    type="button"
                    variant={housingType === "apartment" ? "default" : "outline"}
                    size="sm"
                    disabled={isSaving}
                    onClick={() => setHousingType("apartment")}
                  >
                    Apartment
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="venue-district">District</Label>
                    <Select value={venueDistrict} onValueChange={setVenueDistrict} disabled={isSaving}>
                      <SelectTrigger
                        id="venue-district"
                        className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {FFXIV_DISTRICTS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="venue-ward">Ward</Label>
                    <Input
                      id="venue-ward"
                      type="number"
                      min={1}
                      max={30}
                      placeholder="1–30"
                      value={venueWard}
                      onChange={(e) => setVenueWard(e.target.value)}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                    />
                  </div>
                  {housingType === "house" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="venue-plot">Plot</Label>
                      <Input
                        id="venue-plot"
                        type="number"
                        min={1}
                        max={60}
                        placeholder="1–60"
                        value={venuePlot}
                        onChange={(e) => setVenuePlot(e.target.value)}
                        disabled={isSaving}
                        className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="venue-apartment">Apartment</Label>
                      <Input
                        id="venue-apartment"
                        type="number"
                        min={1}
                        max={99}
                        placeholder="1–99"
                        value={venueApartment}
                        onChange={(e) => setVenueApartment(e.target.value)}
                        disabled={isSaving}
                        className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <p className="col-span-full text-[0.72rem] text-[var(--fg-faint)] mb-2">
                    Legacy free-text hours — use the schedule section above instead.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="default-hours">Default hours (ST)</Label>
                    <Input
                      id="default-hours"
                      placeholder="e.g. 10PM–2AM"
                      value={settings.defaultHours ?? ""}
                      onChange={(e) => setSettings({ ...settings, defaultHours: e.target.value })}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="open-nights">Open nights</Label>
                    <Input
                      id="open-nights"
                      placeholder="e.g. Fri & Sat"
                      value={settings.openNights ?? ""}
                      onChange={(e) => setSettings({ ...settings, openNights: e.target.value })}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue-type">Venue type</Label>
                  <select
                    id="venue-type"
                    value={settings.venueType ?? ""}
                    onChange={(e) => setSettings({ ...settings, venueType: e.target.value || null })}
                    disabled={isSaving}
                    className="w-full h-9 rounded-md border border-[var(--blue-015)] bg-background px-3 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                  >
                    <option value="">Select a type...</option>
                    <option value="BAR_TAVERN">Bar / Tavern</option>
                    <option value="NIGHTCLUB">Nightclub</option>
                    <option value="LOUNGE">Lounge</option>
                    <option value="HOST_CLUB">Host Club</option>
                    <option value="CABARET">Cabaret</option>
                    <option value="BATHHOUSE">Bathhouse / Spa</option>
                    <option value="CASINO">Casino</option>
                    <option value="STUDIO">Creative Studio</option>
                    <option value="OTHER">Other</option>
                    <option value="TEST_VENUE">Test Venue</option>
                  </select>
                </div>
                <div className="setrow" style={{ paddingLeft: 0, paddingRight: 0, border: "none" }}>
                  <div className="sinfo">
                    <div className="stitle">Adult (18+) venue</div>
                    <div className="sdesc">Show the 18+ badge on your public listing.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isAdult: !settings.isAdult })}
                    disabled={isSaving}
                    className={`toggle${settings.isAdult ? " on" : ""}`}
                  />
                </div>
              </div>
            </section>

            {/* ── Integrations ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Integrations
                </span>
              </div>

              {/* Dalamud */}
              <div className="introw">
                <span className="iconbadge ii em" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="6" y="2" width="12" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Dalamud Plugin</div>
                  <div className="idesc">In-game sales, clock-in and patron capture</div>
                </div>
                <Link
                  href={`/dashboard/${slug}/settings/api-keys`}
                  className="text-xs font-semibold text-[var(--xiv-blue)] hover:underline shrink-0"
                >
                  Manage API Keys →
                </Link>
              </div>

              {/* ffxivvenues.com */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">ffxivvenues.com</div>
                  <div className="idesc">Import your profile and hours from your ffxivvenues.com listing</div>
                </div>
                {ffxivLink && (
                  <span className="status open">
                    <span className="dot" />
                    Linked
                  </span>
                )}
                <div className="w-full pl-[54px] space-y-3">
                  {!xvmApiVenueId ? (
                    <p className="text-xs text-[var(--fg-faint)]">Connect this venue to xvm-api first.</p>
                  ) : ffxivLink ? (
                    <>
                      <p className="text-xs text-[var(--fg-faint)]">
                        Schedule synced every 2 hours.
                        {ffxivLink.last_synced_at && (
                          <>
                            {" "}
                            Last synced: <LocalTime date={ffxivLink.last_synced_at} />
                          </>
                        )}
                      </p>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={handleFfxivSyncNow}
                          disabled={ffxivSyncing}
                        >
                          {ffxivSyncing ? "Syncing…" : "Sync now"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="destructive" size="sm" disabled={ffxivUnlinking}>
                              {ffxivUnlinking ? "Unlinking…" : "Unlink"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unlink ffxivvenues.com?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The hours imported from your listing will be removed from your profile.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleFfxivUnlink}>Unlink</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </>
                  ) : ffxivListings ? (
                    ffxivListings.length === 0 ? (
                      <>
                        <p className="text-xs text-[var(--fg-faint)]">
                          No listings found. Ask to be added as a manager on{" "}
                          <a
                            href="https://ffxivvenues.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--xiv-blue)] hover:underline"
                          >
                            ffxivvenues.com
                          </a>
                          , then try again.
                        </p>
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={handleFfxivLoadListings}
                          disabled={ffxivLoading}
                        >
                          {ffxivLoading ? "Retrying…" : "Retry"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <select
                          value={ffxivSelected}
                          onChange={(e) => setFfxivSelected(e.target.value)}
                          className="w-full rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                        >
                          {ffxivListings.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                              {l.world ? ` (${l.world})` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-[var(--fg-faint)]">
                          Linking imports the listing&apos;s name, description, location, banner and hours onto your
                          venue profile.
                        </p>
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="outline-blue"
                            size="sm"
                            onClick={handleFfxivLink}
                            disabled={ffxivLoading || !ffxivSelected}
                          >
                            {ffxivLoading ? "Linking…" : "Import and link"}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFfxivListings(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="outline-blue"
                      size="sm"
                      onClick={handleFfxivLoadListings}
                      disabled={ffxivLoading}
                    >
                      {ffxivLoading ? "Loading…" : "Find my listings"}
                    </Button>
                  )}
                  {ffxivError && <p className="text-xs text-red-400">{ffxivError}</p>}
                </div>
              </div>

              {/* Partake */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Partake.gg</div>
                  <div className="idesc">Publish events to the community calendar</div>
                </div>
                {settings.partakeTeamId && (
                  <span className="status open">
                    <span className="dot" />
                    Connected
                  </span>
                )}
                <div className="w-full flex flex-col gap-2 pl-[54px]">
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="Partake team ID (e.g. 123)"
                      value={settings.partakeTeamId ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        setSettings({ ...settings, partakeTeamId: val ? parseInt(val, 10) : null })
                      }}
                      disabled={isSaving}
                      min={1}
                      className="flex-1 bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)] text-sm h-9"
                    />
                    {settings.partakeTeamId && (
                      <Button
                        type="button"
                        variant="outline-blue"
                        size="sm"
                        disabled={isSyncing}
                        onClick={async () => {
                          setIsSyncing(true)
                          setSyncResult("")
                          try {
                            const res = await fetch(`/api/venues/${venueId}/sync-partake`, { method: "POST" })
                            if (!res.ok) {
                              const d = await res.json()
                              throw new Error(d.error || "Sync failed")
                            }
                            const d = await res.json()
                            setSyncResult(`Synced: ${d.results.created} new, ${d.results.updated} updated`)
                            setTimeout(() => setSyncResult(""), 5000)
                          } catch (err: unknown) {
                            setSyncResult(err instanceof Error ? err.message : "Sync failed")
                          } finally {
                            setIsSyncing(false)
                          }
                        }}
                      >
                        {isSyncing ? "Syncing…" : "Sync now"}
                      </Button>
                    )}
                  </div>
                  {syncResult && <p className="text-xs text-emerald-400">{syncResult}</p>}
                  {settings.partakeTeamId && (
                    <p className="text-xs text-[var(--fg-faint)]">Syncs automatically every hour.</p>
                  )}
                </div>
              </div>

              {/* xvm-api */}
              {userRole === "OWNER" && (
                <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                  <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </span>
                  <div className="iinfo">
                    <div className="iname">xvm-api</div>
                    <div className="idesc">Required for Rooms and other live venue features</div>
                  </div>
                  {xvmApiVenueId && (
                    <span className="status open">
                      <span className="dot" />
                      Connected
                    </span>
                  )}
                  <div className="w-full pl-[54px] space-y-3">
                    {xvmApiVenueId ? (
                      <p className="text-xs text-[var(--fg-faint)]">
                        Connected
                        {xvmApiVenueLinkedAt && (
                          <>
                            {" "}
                            on <LocalTime date={xvmApiVenueLinkedAt} />
                          </>
                        )}
                        .
                      </p>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={handleXvmConnect}
                          disabled={xvmConnecting}
                        >
                          {xvmConnecting ? "Connecting…" : "Connect to xvm-api"}
                        </Button>
                        {xvmConnectError && <p className="text-xs text-red-400">{xvmConnectError}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Frogge Bot */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Frogge Bot</div>
                  <div className="idesc">Discord posting</div>
                </div>
                {froggeConnected && (
                  <span className="status open">
                    <span className="dot" />
                    Connected
                  </span>
                )}
                <div className="w-full pl-[54px] space-y-3">
                  {froggeConnected ? (
                    <>
                      <p className="text-xs text-[var(--fg-faint)]">
                        Connected. Use the Rooms page to post to Discord.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" size="sm" disabled={froggeDisconnecting}>
                            {froggeDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Frogge?</AlertDialogTitle>
                            <AlertDialogDescription>Room sync and Discord posting will stop.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleFroggeDisconnect}>Disconnect</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="8-character code from Frogge"
                          value={froggeCode}
                          onChange={(e) => setFroggeCode(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleFroggeConnect()}
                          maxLength={8}
                          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm font-mono uppercase tracking-wider focus:border-[var(--blue-035)] focus:outline-none"
                        />
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={handleFroggeConnect}
                          disabled={froggeConnecting || !froggeCode.trim()}
                        >
                          {froggeConnecting ? "Connecting…" : "Connect"}
                        </Button>
                      </div>
                      {froggeError && <p className="text-xs text-red-400">{froggeError}</p>}
                      <p className="text-xs text-[var(--fg-faint)]">
                        Get a code from your Discord: <strong>/admin menu → Settings → Integrations → Connect XIV Venue Manager</strong>.
                        Codes expire in 5 minutes.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Discord */}
              <div className="introw">
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Discord</div>
                  <div className="idesc">OAuth sign-in and event webhooks</div>
                </div>
                <span className="status open">
                  <span className="dot" />
                  Connected
                </span>
              </div>
            </section>

            {/* ── Discord Shift Bot ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Discord Shift Bot
                </span>
              </div>
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Discord Shift Bot</div>
                  <div className="idesc">Post shift signup embeds before each event</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer ml-auto shrink-0">
                  <input
                    type="checkbox"
                    checked={shiftBotEnabled}
                    onChange={(e) => setShiftBotEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{shiftBotEnabled ? "Enabled" : "Disabled"}</span>
                </label>
                {shiftBotEnabled && (
                  <div className="w-full pl-[54px] space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Discord Channel ID</label>
                      <input
                        type="text"
                        value={shiftBotChannelId}
                        onChange={(e) => setShiftBotChannelId(e.target.value)}
                        placeholder="Right-click channel → Copy ID"
                        className="flex-1 w-full rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                      />
                      <p className="text-xs text-[var(--fg-faint)] mt-1">
                        Enable Developer Mode in Discord settings to copy channel IDs.{" "}
                        <a
                          href={`https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID}&scope=bot&permissions=274877908992`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--xiv-blue)] hover:underline"
                        >
                          Invite the bot to your server →
                        </a>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Embed Thumbnail URL <span className="text-[var(--fg-faint)] font-normal">(optional)</span>
                      </label>
                      <input
                        type="url"
                        value={shiftBotThumbnailUrl}
                        onChange={(e) => setShiftBotThumbnailUrl(e.target.value)}
                        placeholder="https://… — leave blank to use your Discord server icon"
                        className="flex-1 w-full rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Days before event to post</label>
                      <input
                        type="number"
                        min={1}
                        max={14}
                        value={shiftBotDaysBefore}
                        onChange={(e) => setShiftBotDaysBefore(Number(e.target.value))}
                        className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none w-24 text-center"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">Shift Templates</label>
                        <Button
                          type="button"
                          variant="outline-blue"
                          size="sm"
                          onClick={() =>
                            setShiftBotTemplates((t) => [
                              ...t,
                              { name: "", startOffsetHours: 0, durationHours: 4, slots: 5 },
                            ])
                          }
                        >
                          + Add Template
                        </Button>
                      </div>
                      <p className="text-xs text-[var(--fg-faint)] mb-3">
                        Leave empty to post one shift per event matching the full event duration.
                      </p>
                      {shiftBotTemplates.length > 0 && (
                        <div className="flex gap-2 items-center px-3 mb-1">
                          <span className="flex-1 text-xs text-[var(--fg-faint)]">Name</span>
                          <span className="w-[4.5rem] text-xs text-[var(--fg-faint)] text-center">Offset (h)</span>
                          <span className="w-[4.5rem] text-xs text-[var(--fg-faint)] text-center">Duration (h)</span>
                          <span className="w-[4.5rem] text-xs text-[var(--fg-faint)] text-center">Slots</span>
                          <span className="w-5" />
                        </div>
                      )}
                      <div className="space-y-3">
                        {shiftBotTemplates.map((t, i) => (
                          <div
                            key={i}
                            className="flex gap-2 items-center p-3 rounded-lg border border-[var(--blue-018)] bg-[var(--card)]"
                          >
                            <input
                              type="text"
                              value={t.name}
                              onChange={(e) =>
                                setShiftBotTemplates((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                                )
                              }
                              placeholder="Shift name"
                              className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none flex-1"
                            />
                            <input
                              type="number"
                              min={0}
                              value={t.startOffsetHours}
                              onChange={(e) =>
                                setShiftBotTemplates((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, startOffsetHours: Number(e.target.value) } : x))
                                )
                              }
                              className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-2 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none w-[4.5rem] text-center"
                            />
                            <input
                              type="number"
                              min={1}
                              value={t.durationHours}
                              onChange={(e) =>
                                setShiftBotTemplates((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, durationHours: Number(e.target.value) } : x))
                                )
                              }
                              className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-2 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none w-[4.5rem] text-center"
                            />
                            <input
                              type="number"
                              min={1}
                              value={t.slots}
                              onChange={(e) =>
                                setShiftBotTemplates((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, slots: Number(e.target.value) } : x))
                                )
                              }
                              className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-2 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none w-[4.5rem] text-center"
                            />
                            <button
                              type="button"
                              onClick={() => setShiftBotTemplates((prev) => prev.filter((_, j) => j !== i))}
                              className="text-[var(--fg-faint)] hover:text-red-400 text-sm px-1 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Operations ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v8" />
                    <path d="M9 10.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" />
                  </svg>
                  Operations
                </span>
              </div>

              {/* Pot Payroll */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v8" />
                    <path d="M9 10.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Pot Payroll</div>
                  <div className="idesc">Nightly revenue/tip pooling instead of (or alongside) hourly pay</div>
                </div>
                <div className="w-full pl-[54px] space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Tax percent</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={potTaxPercent}
                        onChange={(e) => setPotTaxPercent(Number(e.target.value))}
                        className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none w-24 text-center"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={potIncludeSalesInPot}
                        onChange={(e) => setPotIncludeSalesInPot(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Include regular sales in the pot (off = tips-only pot)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={potDefaultTipPooled}
                        onChange={(e) => setPotDefaultTipPooled(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Default new staff to pooling their tips</span>
                    </label>
                  </div>
              </div>

              {/* Finance Categories */}
              {venueId && (
                <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                  <div className="iinfo w-full">
                    <div className="iname">Finance Categories</div>
                    <div className="idesc">Group transactions for reporting — optional, sales work without one</div>
                  </div>
                  <div className="w-full">
                    <FinanceCategoriesSettings key={xvmApiVenueId ?? "disconnected"} venueId={venueId} />
                  </div>
                </div>
              )}

              {/* Bar Inventory */}
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 2h8" />
                    <path d="M9 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8.5V2" />
                  </svg>
                </span>
                <div className="iinfo">
                  <div className="iname">Bar Inventory Tracking</div>
                  <div className="idesc">Map menu items to bar stock and track inventory levels</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer ml-auto shrink-0">
                  <input
                    type="checkbox"
                    checked={inventoryEnabled}
                    onChange={(e) => setInventoryEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{inventoryEnabled ? "Enabled" : "Disabled"}</span>
                </label>
              </div>
            </section>

            {/* ── Discord Webhooks ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Discord Webhooks
                </span>
              </div>
              <div className="pbody space-y-5">
                <p className="text-xs text-[var(--fg-faint)]">
                  Server Settings → Integrations → Webhooks → New Webhook. Paste the URL below.
                </p>
                {[
                  {
                    id: "webhook-staff",
                    label: "Staff operations",
                    desc: "Task and staff notifications",
                    value: settings.discordWebhooks.staff,
                    onChange: (v: string) =>
                      setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, staff: v } }),
                    checks: [
                      {
                        id: "task-created",
                        label: "Task created",
                        val: settings.webhooks.taskCreated,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, taskCreated: v } }),
                        disabled: false,
                      },
                      {
                        id: "task-done",
                        label: "Task completed",
                        val: settings.webhooks.taskCompleted,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, taskCompleted: v } }),
                        disabled: false,
                      },
                      {
                        id: "staff-joined",
                        label: "Staff joined",
                        val: settings.webhooks.staffJoined,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, staffJoined: v } }),
                        disabled: false,
                      },
                    ],
                  },
                  {
                    id: "webhook-events",
                    label: "Events channel",
                    desc: "Event announcements and Partake mirrors",
                    value: settings.discordWebhooks.events,
                    onChange: (v: string) =>
                      setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, events: v } }),
                    checks: [
                      {
                        id: "partake-mirror",
                        label: "Partake event mirror",
                        val: settings.webhooks.partakeEvent,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, partakeEvent: v } }),
                        disabled: !settings.partakeTeamId,
                      },
                    ],
                  },
                  {
                    id: "webhook-revenue",
                    label: "Revenue channel",
                    desc: "Sales and daily summaries",
                    value: settings.discordWebhooks.revenue,
                    onChange: (v: string) =>
                      setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, revenue: v } }),
                    checks: [
                      {
                        id: "sale-logged",
                        label: "Sale logged",
                        val: settings.webhooks.saleLogged,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, saleLogged: v } }),
                        disabled: false,
                      },
                      {
                        id: "daily-summary",
                        label: "Daily sales summary",
                        val: settings.webhooks.dailySalesSummary,
                        set: (v: boolean) =>
                          setSettings({ ...settings, webhooks: { ...settings.webhooks, dailySalesSummary: v } }),
                        disabled: false,
                      },
                    ],
                  },
                ].map((wh) => (
                  <div key={wh.id}>
                    <Label
                      htmlFor={wh.id}
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block"
                    >
                      {wh.label}
                    </Label>
                    <Input
                      id={wh.id}
                      type="url"
                      placeholder="https://discord.com/api/webhooks/…"
                      value={wh.value}
                      onChange={(e) => wh.onChange(e.target.value)}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)] text-sm h-9 mb-1"
                    />
                    <p className="text-xs text-[var(--fg-faint)] mb-2">{wh.desc}</p>
                    {wh.value && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-2 border-l-2 border-[var(--blue-015)]">
                        {wh.checks.map((c) => (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 text-xs cursor-pointer ${c.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                          >
                            <Checkbox
                              checked={c.val}
                              onCheckedChange={(v) => c.set(v as boolean)}
                              disabled={isSaving || c.disabled}
                              className="w-3.5 h-3.5"
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── Staff permissions ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Staff permissions
                </span>
              </div>
              <p className="px-5 pt-3 text-xs text-[var(--fg-faint)]">
                Owners and managers always have full access. These settings apply to staff only.
              </p>
              <div className="mt-1">
                {[
                  {
                    id: "task-vis",
                    label: "Tasks",
                    desc: "Which tasks staff can see",
                    value: settings.taskVisibility,
                    onChange: (v: string) =>
                      setSettings({ ...settings, taskVisibility: v as "all" | "assigned" | "assigned_unassigned" }),
                    options: [
                      { value: "all", label: "All tasks" },
                      { value: "assigned", label: "Assigned only" },
                      { value: "assigned_unassigned", label: "Assigned + unassigned" },
                    ],
                  },
                  {
                    id: "sales-vis",
                    label: "Sales",
                    desc: "Which transactions staff can see",
                    value: settings.salesVisibility,
                    onChange: (v: string) => setSettings({ ...settings, salesVisibility: v as "all" | "own" | "none" }),
                    options: [
                      { value: "all", label: "All transactions" },
                      { value: "own", label: "Their own only" },
                      { value: "none", label: "No access" },
                    ],
                  },
                  {
                    id: "rev-vis",
                    label: "Revenue",
                    desc: "Revenue statistics visibility",
                    value: settings.revenueVisibility,
                    onChange: (v: string) =>
                      setSettings({ ...settings, revenueVisibility: v as "all" | "hide" | "own" }),
                    options: [
                      { value: "all", label: "All statistics" },
                      { value: "own", label: "Personal only" },
                      { value: "hide", label: "Hidden" },
                    ],
                  },
                  {
                    id: "event-vis",
                    label: "Events",
                    desc: "Which events staff can see",
                    value: settings.eventVisibility,
                    onChange: (v: string) => setSettings({ ...settings, eventVisibility: v as "all" | "published" }),
                    options: [
                      { value: "all", label: "All (including drafts)" },
                      { value: "published", label: "Published only" },
                    ],
                  },
                ].map((row) => (
                  <div key={row.id} className="setrow">
                    <div className="sinfo">
                      <div className="stitle">{row.label}</div>
                      <div className="sdesc">{row.desc}</div>
                    </div>
                    <Select value={row.value} onValueChange={row.onChange} disabled={isSaving}>
                      <SelectTrigger className="w-[180px] h-8 text-xs bg-background border-[var(--blue-015)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {row.options.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Danger zone ── */}
            {userRole === "OWNER" && (
              <section className="panel" style={{ borderColor: "rgba(243,139,168,0.3)" }}>
                <div className="ph" style={{ borderBottomColor: "rgba(243,139,168,0.18)" }}>
                  <span className="pt" style={{ color: "var(--destructive)" }}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: "var(--destructive)" }}
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01" />
                    </svg>
                    Danger zone
                  </span>
                </div>
                <div className="pbody">
                  <div className="setrow" style={{ paddingLeft: 0, paddingRight: 0, border: "none" }}>
                    <div className="sinfo">
                      <div className="stitle">Delete venue</div>
                      <div className="sdesc">
                        Permanently removes the venue and all associated data. Cannot be undone.
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={isDeleting}>
                          {isDeleting ? "Deleting…" : "Delete venue"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this venue?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All events, staff, tasks, sales and settings will be permanently removed. This cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteVenue}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Yes, delete permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      {isDirty && (
        <div className="fixed bottom-0 left-0 [@media(min-width:1081px)]:left-[300px] right-0 z-50 border-t border-[var(--blue-015)] bg-[#070b14]/95 backdrop-blur-md">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--fg-faint)]">{xvmUnavailable ? SAVE_OFF_MESSAGE : "You have unsaved changes"}</p>
            <Button variant="cta" size="sm" onClick={handleSave} disabled={isSaving || xvmUnavailable} className="xiv-btn-shimmer">
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </VenueLayoutClient>
  )
}
