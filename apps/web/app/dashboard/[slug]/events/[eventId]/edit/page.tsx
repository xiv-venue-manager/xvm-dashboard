"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { PageLoading } from "@/components/ui/loading-spinner"

const EVENT_TYPES = [
  { value: "PERFORMANCE", label: "Performance" },
  { value: "GAME_NIGHT", label: "Game Night" },
  { value: "SPECIAL", label: "Special Event" },
  { value: "SOCIAL", label: "Social Gathering" },
  { value: "PRIVATE", label: "Private Event" },
  { value: "OTHER", label: "Other" },
]

const EVENT_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

interface Event {
  id: string
  title: string
  description?: string
  eventType: string
  status: string
  startTime: string
  endTime: string
}

const selectableStatuses = (current: string) => [
  current,
  ...(current === "DRAFT" ? ["PUBLISHED"] : []),
  ...(current !== "CANCELLED" && current !== "COMPLETED" ? ["CANCELLED"] : []),
]

export default function EditEventPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const eventId = params.eventId as string

  const [event, setEvent] = useState<Event | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [startTime, setStartTime] = useState<Date>()
  const [endTime, setEndTime] = useState<Date>()
  const [selectedEventType, setSelectedEventType] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        // Get venue first
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)

        if (!venue) throw new Error("Venue not found")

        // Get event
        const eventResponse = await fetch(`/api/venues/${venue.id}/events/${eventId}`)
        if (!eventResponse.ok) throw new Error("Failed to fetch event")

        const eventData = await eventResponse.json()
        setEvent(eventData)
        setStartTime(new Date(eventData.startTime))
        setEndTime(new Date(eventData.endTime))
        setSelectedEventType(eventData.eventType)
        setSelectedStatus(eventData.status)
      } catch (err) {
        setError("Failed to load event")
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEvent()
  }, [slug, eventId])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    if (!startTime || !endTime) {
      setError("Please select both start and end times")
      setIsSubmitting(false)
      return
    }

    if (endTime <= startTime) {
      setError("End time must be after start time")
      setIsSubmitting(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const data = {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      eventType: selectedEventType,
      status: selectedStatus,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    }

    try {
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      if (!venue) throw new Error("Venue not found")

      const response = await fetch(`/api/venues/${venue.id}/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || error.message || "Failed to update event")
      }

      router.push(`/dashboard/${slug}/events/${eventId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading text="Loading event..." />
        </div>
      </VenueLayoutClient>
    )
  }

  if (!event) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="p-4 md:p-6 text-center">
          <p className="text-destructive">Event not found</p>
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Edit Event</CardTitle>
            <CardDescription>Update event details and settings</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Event Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Event Title *</Label>
                <Input id="title" name="title" defaultValue={event.title} required />
              </div>

              {/* Event Type */}
              <div className="space-y-2">
                <Label htmlFor="eventType">Event Type *</Label>
                <Select value={selectedEventType} onValueChange={setSelectedEventType} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" defaultValue={event.description || ""} rows={4} />
              </div>

              {/* Start Time */}
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <DateTimePicker date={startTime} onDateChange={setStartTime} />
              </div>

              {/* End Time */}
              <div className="space-y-2">
                <Label>End Time *</Label>
                <DateTimePicker date={endTime} onDateChange={setEndTime} />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.filter((status) => selectableStatuses(event.status).includes(status.value)).map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Error Message */}
              {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

              {/* Submit Buttons */}
              <div className="flex gap-4">
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </VenueLayoutClient>
  )
}
