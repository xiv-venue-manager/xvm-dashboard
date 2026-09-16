"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RoleBadge } from "@/components/role-badge"
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

interface Transaction {
  id: string
  amount: number
  customerName: string | null
  notes: string | null
  createdAt: string
  service: {
    id: string
    name: string
    price: number
  } | null
  event: {
    id: string
    title: string
  } | null
  staff: {
    id: string
    name: string | null
    memberships?: Array<{
      role: string
      customRole: {
        name: string
        color: string | null
      } | null
    }>
  } | null
}

interface TransactionsListProps {
  initialTransactions: Transaction[]
  initialNextCursor: string | null
  initialHasMore: boolean
  venueId: string
}

export function TransactionsList({
  initialTransactions,
  initialNextCursor,
  initialHasMore,
  venueId,
}: TransactionsListProps) {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const hasPaginatedRef = useRef(false)

  // useState's initial value only runs on first mount - router.refresh()
  // (e.g. after logging a sale) re-renders the parent Server Component
  // with fresh props, but this client component's own state won't pick
  // them up on its own. Re-sync whenever the server sends a new first page.
  //
  // Merge rather than overwrite: initialTransactions is always just the
  // first page, so a plain overwrite would wipe out any further pages the
  // user had already loaded via "Load more". Keep those, just fold in
  // whatever's new/changed on the first page.
  //
  // Same reasoning for the cursor - once the user has paginated past page
  // 1, nextCursor/hasMore reflect how far *they've* gotten, not the fresh
  // page's cursor (which always points to right after page 1) - leave
  // those alone once pagination has started.
  useEffect(() => {
    setTransactions((prev) => {
      const freshIds = new Set(initialTransactions.map((t) => t.id))
      const extras = prev.filter((t) => !freshIds.has(t.id))
      return [...initialTransactions, ...extras]
    })
    if (!hasPaginatedRef.current) {
      setNextCursor(initialNextCursor)
      setHasMore(initialHasMore)
    }
  }, [initialTransactions, initialNextCursor, initialHasMore])
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editFormData, setEditFormData] = useState({
    amount: "",
    customerName: "",
    notes: "",
  })

  const loadMoreTransactions = async () => {
    if (!nextCursor || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const response = await fetch(`/api/venues/${venueId}/transactions?limit=50&cursor=${nextCursor}`)

      if (response.ok) {
        const data = await response.json()
        hasPaginatedRef.current = true
        setTransactions([...transactions, ...data.transactions])
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
    } catch (err) {
      console.error("Failed to load more transactions:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const exportToCSV = () => {
    // CSV Headers
    const headers = ["Date", "Event", "Service", "Amount (gil)"]

    // CSV Rows
    const rows = transactions.map((transaction) => {
      const date = formatLocalTime(transaction.createdAt, "isoDateTime")
      const event = transaction.event?.title || ""
      const service = transaction.service?.name || "Manual Sale"
      const amount = parseFloat(transaction.amount.toString())

      return [date, event, service, amount]
    })

    // Combine headers and rows
    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")

    // Create download
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

      const updated = await response.json()

      // Update local state
      setTransactions(transactions.map((t) => (t.id === editingTransaction.id ? updated : t)))

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
      const response = await fetch(`/api/venues/${venueId}/transactions/${deletingTransaction.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete transaction")
      }

      // Remove from local state
      setTransactions(transactions.filter((t) => t.id !== deletingTransaction.id))

      setDeletingTransaction(null)
    } catch (error) {
      console.error("Error deleting transaction:", error)
      alert("Failed to delete transaction")
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
          const amount = parseFloat(transaction.amount.toString())
          const isLarge = amount >= 500000
          const isMedium = amount >= 50000 && amount < 500000
          return (
            <div
              key={transaction.id}
              className="xiv-card rounded-xl flex items-center justify-between p-4 gap-4 hover:border-[rgba(0,180,255,0.35)] transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold">{transaction.service ? transaction.service.name : "Manual Sale"}</p>
                  {transaction.event && (
                    <Badge variant="outline" className="text-xs">
                      {transaction.event.title}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {transaction.customerName && <span className="text-foreground/70">{transaction.customerName}</span>}
                  {transaction.customerName && <span>·</span>}
                  <span>{formatLocalTime(transaction.createdAt, "datetimelong")}</span>
                  {transaction.staff && (
                    <>
                      <span>· {transaction.staff.name}</span>
                      {transaction.staff.memberships?.[0]?.customRole && (
                        <RoleBadge
                          role={transaction.staff.memberships[0].customRole.name}
                          color={transaction.staff.memberships[0].customRole.color}
                          className="text-[10px] px-1 py-0 h-4"
                        />
                      )}
                    </>
                  )}
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
                  {amount.toLocaleString("en-US")} gil
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
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={loadMoreTransactions}
            disabled={isLoadingMore}
            className="w-full sm:w-auto"
          >
            {isLoadingMore ? "Loading..." : "Load More Transactions"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Showing {transactions.length} of many transactions</p>
        </div>
      )}

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
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction for{" "}
              <strong>{deletingTransaction?.amount.toLocaleString("en-US")} gil</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
