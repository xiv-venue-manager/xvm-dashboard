import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Target = { href: string; onClick?: never } | { onClick: () => void; href?: never }

export type BackLinkProps = Target & {
  /** The page it goes back to, as the page is named. The label is always "Back to {to}". */
  to: string
  /** "link" is the quiet text link at the top of a page. "button" is the outline button for a header or an error state. */
  variant?: "link" | "button"
  className?: string
}

const LINK_CLASS =
  "inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-[var(--xiv-blue)]"

/** The way back up one level. A route renders a link, a callback renders a button, and the wording is fixed. */
export function BackLink({ to, variant = "link", className, href, onClick }: BackLinkProps) {
  const content = (
    <>
      <ArrowLeft className="h-4 w-4" />
      Back to {to}
    </>
  )

  if (variant === "button") {
    return href !== undefined ? (
      <Button variant="outline" size="sm" asChild className={className}>
        <Link href={href}>{content}</Link>
      </Button>
    ) : (
      <Button variant="outline" size="sm" onClick={onClick} className={className}>
        {content}
      </Button>
    )
  }

  return href !== undefined ? (
    <Link href={href} className={cn(LINK_CLASS, className)}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(LINK_CLASS, className)}>
      {content}
    </button>
  )
}
