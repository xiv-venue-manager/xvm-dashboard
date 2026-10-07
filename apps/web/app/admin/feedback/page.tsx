"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge, badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"

interface Feedback {
  id: string
  category: string
  status: string
  subject: string
  description: string
  url: string | null
  userAgent: string | null
  adminNotes: string | null
  createdAt: string
  reviewedAt: string | null
  user: {
    id: string
    displayName: string
  }
  reviewer: {
    id: string
    displayName: string
  } | null
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

const categoryColors: Record<string, BadgeVariant> = {
  BUG_REPORT: "destructive",
  FEATURE_REQUEST: "default",
  IMPROVEMENT: "secondary",
  GENERAL: "outline",
}

const statusColors: Record<string, BadgeVariant> = {
  NEW: "default",
  UNDER_REVIEW: "secondary",
  PLANNED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "outline",
  WONT_FIX: "destructive",
}

const categoryLabels: Record<string, string> = {
  BUG_REPORT: "🐛 Bug Report",
  FEATURE_REQUEST: "✨ Feature Request",
  IMPROVEMENT: "💡 Improvement",
  GENERAL: "💬 General",
}

export default function AdminFeedbackPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<string>("")
  const [editNotes, setEditNotes] = useState<string>("")

  const fetchFeedback = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.append("status", filterStatus)
      if (filterCategory !== "all") params.append("category", filterCategory)

      const response = await fetch(`/api/admin/feedback?${params}`)

      if (!response.ok) {
        if (response.status === 403) {
          alert("You don't have admin access")
          router.push("/dashboard")
          return
        }
        throw new Error("Failed to fetch feedback")
      }

      const data = await response.json()
      setFeedback(data)
    } catch (error) {
      console.error("Error fetching feedback:", error)
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
    if (session) {
      // Genuine data fetch (sets feedback/loading state), not derivable from props/state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchFeedback()
    }
  }, [session, filterStatus, filterCategory])

  const startEditing = (item: Feedback) => {
    setEditingId(item.id)
    setEditStatus(item.status)
    setEditNotes(item.adminNotes || "")
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditStatus("")
    setEditNotes("")
  }

  const saveChanges = async (feedbackId: string) => {
    try {
      const response = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: editStatus,
          adminNotes: editNotes,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update feedback")
      }

      // Refresh list
      await fetchFeedback()
      cancelEditing()
    } catch (error) {
      console.error("Error updating feedback:", error)
      alert("Failed to update feedback")
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <PageLoading text="Loading feedback..." />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Admin: Feedback Management</h1>
        <p className="text-muted-foreground">Review and manage user feedback submissions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Label htmlFor="status-filter">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="WONT_FIX">Won&apos;t Fix</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label htmlFor="category-filter">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger id="category-filter">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="BUG_REPORT">Bug Report</SelectItem>
              <SelectItem value="FEATURE_REQUEST">Feature Request</SelectItem>
              <SelectItem value="IMPROVEMENT">Improvement</SelectItem>
              <SelectItem value="GENERAL">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feedback.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feedback.filter((f) => f.status === "NEW").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {feedback.filter((f) => f.status === "IN_PROGRESS" || f.status === "PLANNED").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{feedback.filter((f) => f.status === "COMPLETED").length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback List */}
      <div className="space-y-4">
        {feedback.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">No feedback submissions yet</p>
            </CardContent>
          </Card>
        ) : (
          feedback.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={categoryColors[item.category]}>{categoryLabels[item.category]}</Badge>
                      <Badge variant={statusColors[item.status]}>{item.status.replace("_", " ")}</Badge>
                    </div>
                    <CardTitle className="text-xl mb-1">{item.subject}</CardTitle>
                    <CardDescription>
                      From {item.user.displayName} •{" "}
                      {format(new Date(item.createdAt), "PPp")}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    {expandedId === item.id ? "Collapse" : "Expand"}
                  </Button>
                </div>
              </CardHeader>

              {expandedId === item.id && (
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Description:</h4>
                      <p className="text-sm whitespace-pre-wrap">{item.description}</p>
                    </div>

                    {item.url && (
                      <div>
                        <h4 className="font-semibold mb-1">Page URL:</h4>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {item.url}
                        </a>
                      </div>
                    )}

                    {item.userAgent && (
                      <div>
                        <h4 className="font-semibold mb-1">User Agent:</h4>
                        <p className="text-xs text-muted-foreground">{item.userAgent}</p>
                      </div>
                    )}

                    {editingId === item.id ? (
                      <div className="border-t pt-4 space-y-4">
                        <div>
                          <Label htmlFor={`status-${item.id}`}>Status</Label>
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger id={`status-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NEW">New</SelectItem>
                              <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                              <SelectItem value="PLANNED">Planned</SelectItem>
                              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                              <SelectItem value="COMPLETED">Completed</SelectItem>
                              <SelectItem value="WONT_FIX">Won&apos;t Fix</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor={`notes-${item.id}`}>Admin Notes</Label>
                          <Textarea
                            id={`notes-${item.id}`}
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            rows={3}
                            placeholder="Add internal notes about this feedback..."
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={() => saveChanges(item.id)} size="sm">
                            Save Changes
                          </Button>
                          <Button onClick={cancelEditing} variant="outline" size="sm">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t pt-4">
                        {item.adminNotes && (
                          <div className="mb-4">
                            <h4 className="font-semibold mb-1">Admin Notes:</h4>
                            <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{item.adminNotes}</p>
                          </div>
                        )}

                        {item.reviewer && (
                          <p className="text-xs text-muted-foreground mb-4">
                            Last reviewed by {item.reviewer.displayName} on{" "}
                            {item.reviewedAt && format(new Date(item.reviewedAt), "PPp")}
                          </p>
                        )}

                        <Button onClick={() => startEditing(item)} size="sm">
                          Update Status / Add Notes
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
