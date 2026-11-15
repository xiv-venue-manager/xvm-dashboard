import type { ReactNode } from "react"
import { BackLink } from "@/components/back-link"

export interface EditorHeaderProps {
  /** The list the editor came from, as the page is named: "Forms" gives "Back to Forms". */
  backTo: string
  onBack: () => void
  title?: string
  children?: ReactNode
}

/** The top row of an editor that replaces its list: the way back on the left, an optional title, actions on the right. */
export function EditorHeader({ backTo, onBack, title, children }: EditorHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BackLink to={backTo} onClick={onBack} variant="button" />
      {title && <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
