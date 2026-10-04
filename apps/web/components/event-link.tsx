import Link from "next/link"
import type { ReactNode } from "react"

export function EventLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith("/api/")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
