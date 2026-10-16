"use client"

import { useEffect, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, TooltipContentProps } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users } from "lucide-react"

interface AttendanceData {
  time: string // ISO timestamp - formatted to UTC HH:mm at render
  count: number
}

import { formatLocalTime } from "@/components/server-time"

// Format an ISO timestamp in the viewer's own local time.
const fmtLocal = (iso: string) => formatLocalTime(iso, "time")

interface EventAttendanceChartProps {
  venueId: string
  eventId: string
  className?: string
}

export function EventAttendanceChart({ venueId, eventId, className }: EventAttendanceChartProps) {
  const [data, setData] = useState<AttendanceData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/venues/${venueId}/events/${eventId}/attendance`)
        if (!response.ok) throw new Error("Failed to fetch attendance data")
        const jsonData = await response.json()
        setData(jsonData)
      } catch (err) {
        console.error(err)
        setError("Failed to load chart data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [venueId, eventId])

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Patron Attendance</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="h-[300px] flex items-center justify-center text-destructive">{error}</CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Patron Attendance</CardTitle>
          <CardDescription>No attendance data recorded yet.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Patron Attendance
            </CardTitle>
            <CardDescription>Live count tracking over time</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{data[data.length - 1]?.count || 0}</div>
            <div className="text-xs text-muted-foreground">Current Patrons</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b4ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00b4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={fmtLocal}
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }: TooltipContentProps) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[0.70rem] uppercase text-muted-foreground">Time</span>
                            <span className="font-bold text-muted-foreground">
                              {typeof label === "string" ? fmtLocal(label) : label}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[0.70rem] uppercase text-muted-foreground">Patrons</span>
                            <span className="font-bold text-primary">{payload[0].value}</span>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#00b4ff"
                strokeWidth={2}
                fill="url(#attendanceGradient)"
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
