"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FFXIV_DISTRICTS, addressProblem } from "@/lib/venue-location"

// FFXIV Data Centers and Worlds
const DATA_CENTERS = {
  "North America": ["Aether", "Primal", "Crystal", "Dynamis"],
  Europe: ["Chaos", "Light"],
  Japan: ["Elemental", "Gaia", "Mana", "Meteor"],
  Oceania: ["Materia"],
}

const WORLDS_BY_DC: Record<string, string[]> = {
  // North America
  Aether: ["Adamantoise", "Cactuar", "Faerie", "Gilgamesh", "Jenova", "Midgardsormr", "Sargatanas", "Siren"],
  Primal: ["Behemoth", "Excalibur", "Exodus", "Famfrit", "Hyperion", "Lamia", "Leviathan", "Ultros"],
  Crystal: ["Balmung", "Brynhildr", "Coeurl", "Diabolos", "Goblin", "Malboro", "Mateus", "Zalera"],
  Dynamis: ["Cuchulainn", "Golem", "Halicarnassus", "Kraken", "Maduin", "Marilith", "Rafflesia", "Seraph"],

  // Europe
  Chaos: ["Cerberus", "Louisoix", "Moogle", "Omega", "Phantom", "Ragnarok", "Sagittarius", "Spriggan"],
  Light: ["Alpha", "Lich", "Odin", "Phoenix", "Raiden", "Shiva", "Twintania", "Zodiark"],

  // Japan
  Elemental: ["Aegis", "Atomos", "Carbuncle", "Garuda", "Gungnir", "Kujata", "Tonberry", "Typhon"],
  Gaia: ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
  Mana: ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
  Meteor: ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"],

  // Oceania
  Materia: ["Bismarck", "Ravana", "Sephirot", "Sophia", "Zurvan"],
}

export default function NewVenuePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [selectedDataCenter, setSelectedDataCenter] = useState("")
  const [selectedWorld, setSelectedWorld] = useState("")
  const [selectedDistrict, setSelectedDistrict] = useState("")
  const [housingType, setHousingType] = useState<"house" | "apartment">("house")
  const [building, setBuilding] = useState<"" | "main" | "subdivision">("")
  const [slugPreview, setSlugPreview] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    if (!selectedDataCenter || !selectedWorld) {
      setError(!selectedDataCenter ? "Please select a data center." : "Please select a world.")
      setIsSubmitting(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      description: (formData.get("description") as string) || undefined,
      dataCenter: selectedDataCenter,
      world: selectedWorld,
      district: selectedDistrict || undefined,
      ward: (formData.get("ward") as string) ? Number(formData.get("ward")) : undefined,
      plot: housingType === "house" && formData.get("plot") ? Number(formData.get("plot")) : undefined,
      apartment:
        housingType === "apartment" && formData.get("apartment") ? Number(formData.get("apartment")) : undefined,
      subdivision: housingType === "apartment" && building ? building === "subdivision" : undefined,
    }

    const locationProblem = addressProblem(data)
    if (locationProblem) {
      setError(locationProblem)
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create venue")
      }

      const venue = await response.json()
      router.push(venue.profileSaved === false ? `/dashboard/${venue.slug}/settings` : `/dashboard/${venue.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Venue</CardTitle>
          <CardDescription>
            Set up your FFXIV venue. You&apos;ll be able to add staff, events, and services after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Venue Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Venue Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="The Gilded Rose"
                required
                onChange={(e) => {
                  const slugInput = document.getElementById("slug") as HTMLInputElement
                  if (slugInput && !slugInput.value) {
                    const generated = generateSlug(e.target.value)
                    slugInput.value = generated
                    setSlugPreview(generated)
                  }
                }}
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">Venue Page Address *</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="the-gilded-rose"
                required
                pattern="[a-z0-9-]+"
                onChange={(e) => setSlugPreview(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                This sets your venue&apos;s address on this site: lowercase letters, numbers, and hyphens only.
                {slugPreview && (
                  <span className="block mt-1 font-medium text-foreground/70">
                    Your page: xivvenuemanager.com/dashboard/{slugPreview}
                  </span>
                )}
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="A cozy tavern in Ul'dah offering drinks, performances, and good company..."
                rows={4}
              />
            </div>

            {/* Data Center */}
            <div className="space-y-2">
              <Label htmlFor="dataCenter">Data Center *</Label>
              <Select
                name="dataCenter"
                required
                onValueChange={(v) => {
                  setSelectedDataCenter(v)
                  setSelectedWorld("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data center" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_CENTERS).map(([region, dcs]) => (
                    <div key={region}>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">{region}</div>
                      {dcs.map((dc) => (
                        <SelectItem key={dc} value={dc}>
                          {dc}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* World */}
            <div className="space-y-2">
              <Label htmlFor="world">World (Server) *</Label>
              <Select
                name="world"
                required
                value={selectedWorld}
                onValueChange={setSelectedWorld}
                disabled={!selectedDataCenter}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedDataCenter ? "Select world" : "Select data center first"} />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataCenter &&
                    WORLDS_BY_DC[selectedDataCenter]?.map((world) => (
                      <SelectItem key={world} value={world}>
                        {world}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* District / Ward / Plot or Apartment */}
            <div className="space-y-2">
              <Label>In-Game Location</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={housingType === "house" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHousingType("house")}
                >
                  House
                </Button>
                <Button
                  type="button"
                  variant={housingType === "apartment" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHousingType("apartment")}
                >
                  Apartment
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select name="district" value={selectedDistrict} onValueChange={setSelectedDistrict}>
                  <SelectTrigger>
                    <SelectValue placeholder="District" />
                  </SelectTrigger>
                  <SelectContent>
                    {FFXIV_DISTRICTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input id="ward" name="ward" type="number" min={1} max={30} placeholder="Ward (1-30)" />
                {housingType === "house" ? (
                  <Input id="plot" name="plot" type="number" min={1} max={60} placeholder="Plot (1-60)" />
                ) : (
                  <Input id="apartment" name="apartment" type="number" min={1} max={99} placeholder="Apt (1-99)" />
                )}
              </div>
              {housingType === "apartment" && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={building === "main" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBuilding("main")}
                  >
                    Main
                  </Button>
                  <Button
                    type="button"
                    variant={building === "subdivision" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBuilding("subdivision")}
                  >
                    Subdivision
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Help visitors find your venue in-game</p>
            </div>

            {/* Error Message */}
            {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Creating..." : "Create Venue"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
