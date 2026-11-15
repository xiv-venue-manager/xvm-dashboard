import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface EditorHeaderProps {
  backLabel: string
  onBack: () => void
  title?: string
  children?: ReactNode
}

/** The top row of an editor that replaces its list: the way back on the left, an optional title, actions on the right. */
export function EditorHeader({ backLabel, onBack, title, children }: EditorHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Button>
      {title && <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
