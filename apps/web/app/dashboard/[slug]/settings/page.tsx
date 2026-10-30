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
import { Server } from "lucide-react"
import { DiscordGuildConnect } from "@/components/discord-guild-connect"
import { DiscordSettingsCard } from "@/components/discord-settings-card"
import type { VenueImage } from "@/lib/api/xvm-api"
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
import { FFXIV_DISTRICTS, addressProblem, isDistrict } from "@/lib/venue-location"
import { canManageVenue } from "@/lib/roles"

const SETTINGS_LOAD_TIMEOUT_MS = 8000
const SAVE_OFF_MESSAGE = "Saving is off: this venue's profile couldn't be loaded from xvm-api. Reload the page to try again."

export default function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [settings, setSettings] = useState<VenueSettings>({
    taskVisibility: "all",
    salesVisibility: "all",
    revenueVisibility: "all",
    eventVisibility: "all",
    partakeTeamId: null,
    venueType: null,
  })
  // Venue profile DB fields (saved separately)
  const [venueName, setVenueName] = useState("")
  const [venueDescription, setVenueDescription] = useState("")
  const [venueDistrict, setVenueDistrict] = useState<string>("")
  const [venueWard, setVenueWard] = useState<string>("")
  const [venuePlot, setVenuePlot] = useState<string>("")
  const [venueApartment, setVenueApartment] = useState<string>("")
  const [housingType, setHousingType] = useState<"house" | "apartment">("house")
  const [venueBuilding, setVenueBuilding] = useState<"" | "main" | "subdivision">("")
  const [venueDataCenter, setVenueDataCenter] = useState("")
  const [venueWorld, setVenueWorld] = useState("")
  const [tagInput, setTagInput] = useState("")

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [xvmUnavailable, setXvmUnavailable] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [venueId, setVenueId] = useState<string>("")

  const locationProblem = isLoading
    ? null
    : addressProblem({
        district: venueDistrict,
        ward: venueWard ? parseInt(venueWard, 10) : null,
        plot: housingType === "house" && venuePlot ? parseInt(venuePlot, 10) : null,
        apartment: housingType === "apartment" && venueApartment ? parseInt(venueApartment, 10) : null,
        subdivision: housingType === "apartment" && venueBuilding ? venueBuilding === "subdivision" : null,
      })
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
  const [potTaxPercent, setPotTaxPercent] = useState(0)
  const [potIncludeSalesInPot, setPotIncludeSalesInPot] = useState(false)
  const [potDefaultTipPooled, setPotDefaultTipPooled] = useState(false)
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const settingsReadyRef = useRef(false)
  const partakeLoadedRef = useRef(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch settings
  async function loadPotSettings(id: string) {
    const r = await fetch(`/api/venues/${id}/pot-settings`, { signal: AbortSignal.timeout(SETTINGS_LOAD_TIMEOUT_MS) })
    if (!r.ok) return
    const data = await r.json()
    setPotTaxPercent(data.settings.taxPercent)
    setPotIncludeSalesInPot(data.settings.includeSalesInPot)
    setPotDefaultTipPooled(data.settings.defaultTipPooled)
  }

  useEffect(() => {
    if (!slug) return

    const fetchSettings = async () => {
      settingsReadyRef.current = false
      partakeLoadedRef.current = false
      setIsDirty(false)
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
        fetch(`/api/venues/${slug}/gallery`)
          .then((res) => (res.ok ? res.json() : []))
          .then((images: VenueImage[]) => setGalleryImages(images))
          .catch(() => setGalleryImages([]))
        setXvmApiVenueId(venue.xvmApiVenueId ?? null)
        if (venue.memberships?.[0]) {
          setUserRole(venue.memberships[0].role)
        }

        // Get settings
        const settingsResponse = await fetch(`/api/venues/${slug}/settings`)
        if (!settingsResponse.ok) setXvmUnavailable(true)
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setXvmUnavailable(!!settingsData.visibilityDegraded)
          setVenueName(settingsData.name ?? "")
          setVenueDescription(settingsData.description ?? "")
          setVenueDistrict(isDistrict(settingsData.district) ? settingsData.district : "")
          setVenueWard(settingsData.ward != null ? String(settingsData.ward) : "")
          setVenuePlot(settingsData.plot != null ? String(settingsData.plot) : "")
          setVenueApartment(settingsData.apartment != null ? String(settingsData.apartment) : "")
          setHousingType(settingsData.apartment != null ? "apartment" : "house")
          setVenueBuilding(settingsData.subdivision === true ? "subdivision" : settingsData.subdivision === false ? "main" : "")
          setBannerUrl(settingsData.bannerUrl ?? null)
          setLogoUrl(settingsData.logoUrl ?? null)
          setSettings({
            ...settingsData,
            partakeTeamId: null,
            venueType: settingsData.venueType ?? null,
          })
        }

        fetch(`/api/venues/${slug}/partake-link`)
          .then((r) => (r.ok ? r.json() : null))
          .then((link: { teamId: number | null } | null) => {
            if (!link) return
            partakeLoadedRef.current = true
            setSettings((prev) => ({ ...prev, partakeTeamId: link.teamId }))
          })
          .catch(() => {})

        const potLoad = loadPotSettings(slug).catch(() => {})

        if (venue.xvmApiVenueId) {
          fetch(`/api/venues/${slug}/ffxivvenues`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: ListingLinkRow | null) => setFfxivLink(data && !data.unlinked_at ? data : null))
            .catch(() => setFfxivLink(null))
        }

        const inventoryLoad = fetch(`/api/venues/${slug}/inventory-settings`, {
          signal: AbortSignal.timeout(SETTINGS_LOAD_TIMEOUT_MS),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return
            setInventoryEnabled(data.settings.enabled)
          })
          .catch(() => {})

        await Promise.all([potLoad, inventoryLoad])
      } catch (error: unknown) {
        setXvmUnavailable(true)
        setError(error instanceof Error ? error.message : "Failed to load settings")
      } finally {
        setIsLoading(false)
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
    venueBuilding,
    housingType,
    potTaxPercent,
    potIncludeSalesInPot,
    potDefaultTipPooled,
    inventoryEnabled,
  ])

  // Must stay below the dirty effect: the commit that carries the loaded values has to run that effect while the ref is still false.
  useEffect(() => {
    if (!isLoading) settingsReadyRef.current = true
  }, [isLoading])

  const handleSave = async () => {
    if (xvmUnavailable) return
    setIsSaving(true)
    setError("")
    setSuccess(false)

    try {
      if (!venueId) throw new Error("Venue not loaded")
      if (locationProblem) throw new Error(`Venue location: ${locationProblem}`)

      // Save venue profile DB fields (name, description) via PATCH
      const profileRes = await fetch(`/api/venues/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: venueName.trim() || undefined,
          description: venueDescription || null,
          district: venueDistrict || null,
          ward: venueWard ? parseInt(venueWard, 10) : null,
          plot: housingType === "house" && venuePlot ? parseInt(venuePlot, 10) : null,
          apartment: housingType === "apartment" && venueApartment ? parseInt(venueApartment, 10) : null,
          subdivision: housingType === "apartment" && venueBuilding ? venueBuilding === "subdivision" : null,
        }),
      })
      if (!profileRes.ok) {
        const d = await profileRes.json()
        throw new Error(d.error || "Failed to save venue profile")
      }

      // Save settings JSON (tagline, tags, hours, permissions etc.)
      const settingsRes = await fetch(`/api/venues/${slug}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!settingsRes.ok) {
        const d = await settingsRes.json()
        throw new Error(d.error || "Failed to save settings")
      }

      if (userRole === "OWNER" && partakeLoadedRef.current) {
        const partakeRes = await fetch(`/api/venues/${slug}/partake-link`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: settings.partakeTeamId ?? null }),
        })
        if (!partakeRes.ok) {
          const d = await partakeRes.json().catch(() => ({}))
          throw new Error(d.error || "Failed to save Partake team")
        }
      }

      // Save pot payroll settings (separate relational table, own route)
      const potSettingsRes = await fetch(`/api/venues/${slug}/pot-settings`, {
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

      const inventorySettingsRes = await fetch(`/api/venues/${slug}/inventory-settings`, {
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
      const response = await fetch(`/api/venues/${slug}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to deactivate venue")
      }

      // Redirect to dashboard
      router.push("/dashboard")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to deactivate venue")
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
      const res = await fetch(`/api/venues/${slug}/ffxivvenues`, {
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
      const res = await fetch(`/api/venues/${slug}/ffxivvenues/sync`, { method: "POST" })
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
      const res = await fetch(`/api/venues/${slug}/ffxivvenues`, { method: "DELETE" })
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
                      venueSlug={slug}
                      initialUrl={logoUrl}
                      galleryImages={galleryImages.map((img) => img.image_url)}
                      onUpdate={setLogoUrl}
                    />
                  )}
                </div>
                <div className="border-t border-[var(--blue-015)]" />
                <div className="space-y-1.5">
                  <Label>Banner image</Label>
                  {venueId && <BannerUpload venueSlug={slug} initialUrl={bannerUrl} onUpdate={setBannerUrl} />}
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
                {venueId && <GalleryManager venueSlug={slug} initialImages={galleryImages} />}
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
                {housingType === "apartment" && (
                  <div className="space-y-1.5">
                    <Label>Building</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={venueBuilding === "main" ? "default" : "outline"}
                        size="sm"
                        disabled={isSaving}
                        onClick={() => setVenueBuilding("main")}
                      >
                        Main
                      </Button>
                      <Button
                        type="button"
                        variant={venueBuilding === "subdivision" ? "default" : "outline"}
                        size="sm"
                        disabled={isSaving}
                        onClick={() => setVenueBuilding("subdivision")}
                      >
                        Subdivision
                      </Button>
                    </div>
                  </div>
                )}
                {locationProblem && <p className="text-[0.78rem] text-[var(--destructive)]">{locationProblem}</p>}
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
                  href="/dashboard/api-keys"
                  className="text-xs font-semibold text-[var(--xiv-blue)] hover:underline shrink-0"
                >
                  Link the plugin →
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
                  {ffxivLink ? (
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
                          {isDirty && " The page reloads afterwards, so your unsaved changes here will be lost."}
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
                  </div>
                </div>
              </div>
            </section>

            {/* ── Discord ── */}
            <section className="panel">
              <div className="ph">
                <span className="pt">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Discord
                </span>
              </div>
              <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
                <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
                  <Server />
                </span>
                <div className="iinfo min-w-0 flex-1">
                  <div className="iname">Connected server</div>
                  <div className="idesc">Which Discord server this venue belongs to</div>
                </div>
                <div className="ml-auto">
                  {userRole === "OWNER" ? (
                    <DiscordGuildConnect venueSlug={slug} />
                  ) : (
                    <p className="text-xs text-[var(--fg-faint)]">Only the venue owner can change this.</p>
                  )}
                </div>
              </div>
              <DiscordSettingsCard venueSlug={slug} />
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
                    <FinanceCategoriesSettings key={xvmApiVenueId ?? "disconnected"} venueSlug={slug} />
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
                      <div className="stitle">Deactivate venue</div>
                      <div className="sdesc">
                        Hides the venue from your dashboard and the public site. Its records are kept, but you cannot
                        bring it back from here. Contact support to have it restored.
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={isDeleting}>
                          {isDeleting ? "Deactivating…" : "Deactivate venue"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deactivate this venue?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The venue disappears from the dashboard and the public site for everyone. Its events,
                            staff, tasks and sales are kept, but you cannot bring it back from here. Contact support
                            to have it restored.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteVenue}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Yes, deactivate venue
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
