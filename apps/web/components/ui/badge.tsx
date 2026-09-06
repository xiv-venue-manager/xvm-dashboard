import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        tag: "border-[var(--blue-018)] bg-[var(--blue-010)] text-[var(--xiv-blue)]",
        "status-open": "border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.12)] text-[var(--success-text)]",
        "status-closed": "border-[rgba(243,139,168,0.20)] bg-[rgba(243,139,168,0.10)] text-[var(--destructive)]",
        "status-soon": "border-[rgba(249,226,175,0.20)] bg-[rgba(249,226,175,0.10)] text-[var(--warning)]",
        live: "border-[rgba(16,185,129,0.30)] bg-[rgba(16,185,129,0.15)] text-[var(--success-text)] animate-pulse",
        "type-giveaway": "border-[var(--blue-018)] bg-[var(--blue-010)] text-[var(--xiv-blue)]",
        "type-raffle": "border-[rgba(249,226,175,0.20)] bg-[rgba(249,226,175,0.10)] text-[var(--warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
