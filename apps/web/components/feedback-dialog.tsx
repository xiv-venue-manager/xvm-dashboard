"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquare, Check } from "lucide-react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"

export function FeedbackDialog({ iconOnlyBelowLg = false }: { iconOnlyBelowLg?: boolean }) {
  const { data: session } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Form state
  const [category, setCategory] = useState("")
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!category || !subject || !description) {
      return
    }

    setIsSubmitting(true)

    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          subject,
          description,
          url: window.location.href,
        }),
      })

      // Show success state
      setIsSuccess(true)

      // Reset form after 2 seconds and close dialog
      setTimeout(() => {
        setCategory("")
        setSubject("")
        setDescription("")
        setIsSuccess(false)
        setIsOpen(false)
      }, 2000)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to submit feedback. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!session) {
    return null // Don't show feedback button if not logged in
  }

  const trigger = (
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className="font-medium hover:bg-white/5" aria-label="Feedback">
        <MessageSquare className={iconOnlyBelowLg ? "h-4 w-4 lg:mr-2" : "h-4 w-4 sm:mr-2"} />
        <span className={iconOnlyBelowLg ? "hidden lg:inline" : "hidden sm:inline"}>Feedback</span>
      </Button>
    </DialogTrigger>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {iconOnlyBelowLg ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent className="lg:hidden">Feedback</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve XIV Venue Manager by sharing your thoughts, reporting bugs, or suggesting new features.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="rounded-full bg-emerald-500/10 p-3 mb-4">
              <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Thank you!</h3>
            <p className="text-sm text-muted-foreground text-center">Your feedback has been submitted successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUG_REPORT">🐛 Bug Report</SelectItem>
                    <SelectItem value="FEATURE_REQUEST">✨ Feature Request</SelectItem>
                    <SelectItem value="IMPROVEMENT">💡 Improvement</SelectItem>
                    <SelectItem value="GENERAL">💬 General Feedback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  placeholder="Brief summary of your feedback"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Please provide as much detail as possible..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={6}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground text-right">{description.length}/2000 characters</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !category || !subject || !description}>
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
