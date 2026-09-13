"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Edit, Trash2 } from "lucide-react"
import { formatLocalTime } from "@/components/server-time"
import { minorUnitsToDollars } from "@/lib/api/position-convert"

export interface Transaction {
  id: number
  amount: number
  serviceId: number | null
  serviceName: string | null
  recordedByPersonId?: number | null
  customerName: string | null
  notes: string | null
  createdAt: string
}

interface TransactionsListProps {
  transactions: Transaction[]
  venueId: string
  onTransactionsChange: (transactions: Transaction[]) => void
}

export function TransactionsList({ transactions, venueId, onTransactionsChange }: TransactionsListProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editFormData, setEditFormData] = useState({
    amount: "",
    customerName: "",
    notes: "",
  })

  const exportToCSV = () => {
    const headers = ["Date", "Service", "Amount (gil)"]

    const rows = transactions.map((transaction) => {
      const date = formatLocalTime(transaction.createdAt, "isoDateTime")
      const service = transaction.serviceName || "Manual Sale"
      return [date, service, transaction.amount]
    })

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `transactions-${formatLocalTime(new Date(), "isoDate")}.csv`)
    link.style.visibility = "hidden"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openEditDialog = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setEditFormData({
      amount: transaction.amount.toString(),
      customerName: transaction.customerName || "",
      notes: transaction.notes || "",
    })
  }

  const handleEditSubmit = async () => {
    if (!editingTransaction) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/venues/${venueId}/transactions/${editingTransaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(editFormData.amount),
          customerName: editFormData.customerName || null,
          notes: editFormData.notes || null,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update transaction")
      }

      // xvm-api's PATCH echoes the raw finance row back - amount is in minor
      // units, unlike the POST-create response which is already in gil.
      const updated: { id: number; amount: number; customer_name: string | null; notes: string | null } =
        await response.json()

      onTransactionsChange(
        transactions.map((t) =>
          t.id === editingTransaction.id
            ? {
                ...t,
                amount: minorUnitsToDollars(updated.amount) ?? t.amount,
                customerName: updated.customer_name,
                notes: updated.notes,
              }
            : t
        )
      )

      setEditingTransaction(null)
    } catch (error) {
      console.error("Error updating transaction:", error)
      alert("Failed to update transaction")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingTransaction) return

    try {
      // This voids the transaction in xvm-api (an audit row survives) rather
      // than hard-deleting it - it just disappears from this list.
      const response = await fetch(`/api/venues/${venueId}/transactions/${deletingTransaction.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to void transaction")
      }

      onTransactionsChange(transactions.filter((t) => t.id !== deletingTransaction.id))

      setDeletingTransaction(null)
    } catch (error) {
      console.error("Error voiding transaction:", error)
      alert("Failed to void transaction")
    }
  }

  return (
    <>
      {/* Export Button */}
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={exportToCSV} disabled={transactions.length === 0} className="gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export to CSV
        </Button>
      </div>

      <div className="space-y-2">
        {transactions.map((transaction) => {
          const amount = transaction.amount
          const isLarge = amount >= 500000
          const isMedium = amount >= 50000 && amount < 500000
          return (
            <div
              key={transaction.id}
              className="xiv-card rounded-xl flex items-center justify-between p-4 gap-4 hover:border-[rgba(0,180,255,0.35)] transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold">{transaction.serviceName || "Manual Sale"}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {transaction.customerName && <span className="text-foreground/70">{transaction.customerName}</span>}
                  {transaction.customerName && <span>·</span>}
                  <span>{formatLocalTime(transaction.createdAt, "datetimelong")}</span>
                </div>
                {transaction.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">{transaction.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p
                  className={`font-bold tabular-nums ${
                    isLarge
                      ? "text-xl text-emerald-400"
                      : isMedium
                        ? "text-lg text-[var(--xiv-blue)]"
                        : "text-base text-foreground/80"
                  }`}
                >
                  {amount.toLocaleString()} gil
                </p>
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(transaction)}
                    aria-label="Edit transaction"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDeletingTransaction(transaction)}
                    aria-label="Void transaction"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editingTransaction !== null} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>Update the details of this transaction</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount (Gil) *</Label>
              <Input
                id="edit-amount"
                type="number"
                step="1"
                placeholder="0"
                value={editFormData.amount}
                onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Customer Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-customer">Customer Name</Label>
              <Input
                id="edit-customer"
                placeholder="Optional"
                value={editFormData.customerName}
                onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Optional"
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTransaction(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSubmitting || !editFormData.amount}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingTransaction !== null} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this transaction for{" "}
              <strong>{deletingTransaction?.amount.toLocaleString()} gil</strong>? It will be removed from this list
              and marked voided, but kept as an audit record — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
