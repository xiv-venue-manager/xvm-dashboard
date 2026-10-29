"use client"

import { ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { summarise, toggleValue } from "@/lib/team-multiselect"
import { cn } from "@/lib/utils"

type MultiSelectOption = { value: number; label: string }

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: number[]
  onChange: (value: number[]) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  "aria-label"?: string
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  disabled,
  id,
  "aria-label": ariaLabel,
  className,
}: MultiSelectProps) {
  const summary = summarise(value, options, placeholder)
  const empty = value.length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        data-placeholder={empty ? "" : undefined}
        className={cn(
          "border-[rgba(0,180,255,0.2)] hover:border-[rgba(0,180,255,0.4)] data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-[rgba(0,180,255,0.5)] focus-visible:ring-[rgba(0,180,255,0.2)] bg-[rgba(0,180,255,0.04)] flex h-9 w-fit items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-[color,border-color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
      >
        <span className="line-clamp-1">{summary}</span>
        <ChevronDownIcon className="size-4 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.includes(option.value)}
            onCheckedChange={() => onChange(toggleValue(value, option.value))}
            onSelect={(e) => e.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
