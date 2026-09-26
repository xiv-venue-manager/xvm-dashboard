"use client"

import { useState } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface Event {
  id: string | null
  title: string
  startTime: Date | string
  endTime: Date | string
  status: string
  eventType: string
}

interface EventsCalendarProps {
  events: Event[]
  venueSlug: string
}

export function EventsCalendar({ events, venueSlug }: EventsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get day of week for first day of month (0 = Sunday)
  const startDayOfWeek = monthStart.getDay()

  // Create array for calendar grid (including empty cells for previous month)
  const calendarDays = [...Array(startDayOfWeek).fill(null), ...daysInMonth]

  const getEventsForDay = (day: Date | null) => {
    if (!day) return []
    return events.filter((event) => isSameDay(new Date(event.startTime), day))
  }

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const goToToday = () => setCurrentDate(new Date())

  return (
    <div>
      {/* Calendar Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{format(currentDate, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={goToPreviousMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          const dayEvents = getEventsForDay(day)
          const isToday = day && isSameDay(day, new Date())
          const isCurrentMonth = day && isSameMonth(day, currentDate)

          return (
            <Card
              key={index}
              className={`min-h-[100px] ${!isCurrentMonth ? "opacity-40" : ""} ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              <CardContent className="p-2">
                {day && (
                  <>
                    <div className="text-sm font-semibold mb-1">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        event.id === null ? (
                          <div
                            key={`${event.title}-${String(event.startTime)}`}
                            className="text-xs p-1 rounded bg-primary/5 truncate"
                          >
                            {format(new Date(event.startTime), "HH:mm")} {event.title}
                          </div>
                        ) : (
                          <Link key={event.id} href={`/dashboard/${venueSlug}/events/${event.id}`} className="block">
                            <div className="text-xs p-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors truncate">
                              {format(new Date(event.startTime), "HH:mm")} {event.title}
                            </div>
                          </Link>
                        )
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
