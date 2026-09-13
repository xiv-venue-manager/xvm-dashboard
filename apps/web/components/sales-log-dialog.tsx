"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Transaction } from "@/components/transactions-list"

interface Service {
  id: number
  name: string
  price: number
}

interface SalesLogDialogProps {
  venueId: string
  services: Service[]
  onLogged: (transaction: Transaction) => void
}

export function SalesLogDialog({ venueId, services, onLogged }: SalesLogDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    serviceId: "",
    type: "SALE" as "SALE" | "TIP" | "COVER_CHARGE" | "OTHER",
    amount: "",
    customerName: "",
    notes: "",
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleServiceSelect = (serviceId: string) => {
    if (serviceId === "manual") {
      setFormData({ ...formData, serviceId: "", amount: "" })
    } else {
      const service = services.find((s) => String(s.id) === serviceId)
      if (service) {
        setFormData({
          ...formData,
          serviceId,
          amount: service.price.toString(),
        })
      }
    }
  }

  const handleLogSale = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setFormError("Please enter a valid amount")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: formData.serviceId || undefined,
          type: formData.type,
          amount: parseFloat(formData.amount),
          customerName: formData.customerName || undefined,
          notes: formData.notes || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to log sale")
      }

      const created: {
        id: number
        amount: number
        customerName: string | null
        serviceId: number | null
        service: { id: number; name: string | null } | null
        notes: string | null
        createdAt: string
      } = await response.json()

      onLogged({
        id: created.id,
        amount: created.amount,
        serviceId: created.serviceId,
        serviceName: created.service?.name ?? null,
        customerName: created.customerName,
        notes: created.notes,
        createdAt: created.createdAt,
      })

      setIsOpen(false)
      setFormData({ serviceId: "", type: "SALE", amount: "", customerName: "", notes: "" })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to log sale")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDialog = () => {
    setFormData({ serviceId: "", type: "SALE", amount: "", customerName: "", notes: "" })
    setFormError("")
    setIsOpen(true)
  }

  return (
    <>
      <Button onClick={openDialog} size="sm" className="sm:size-default self-start">
        <span className="hidden sm:inline">Log Sale</span>
        <span className="sm:hidden">Log</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Log Sale</DialogTitle>
            <DialogDescription>Record a new transaction</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <Alert className="bg-destructive/10 border-destructive/20">
                <AlertDescription className="text-destructive">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="service">Service (Optional)</Label>
              <Select
                value={formData.serviceId || "manual"}
                onValueChange={handleServiceSelect}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service or enter manual amount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={String(service.id)}>
                      {service.name} - {service.price} gil
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (gil) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1000"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as typeof formData.type })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="tx-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALE">Sale</SelectItem>
                    <SelectItem value="TIP">Tip</SelectItem>
                    <SelectItem value="COVER_CHARGE">Cover charge</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer Name (Optional)</Label>
              <Input
                id="customer"
                placeholder="Customer name"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleLogSale} disabled={isSubmitting}>
              {isSubmitting ? "Logging..." : "Log Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
