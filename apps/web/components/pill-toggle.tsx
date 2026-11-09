interface PillToggleProps<T extends string> {
  options: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
  label?: string
}

export function PillToggle<T extends string>({ options, value, onChange, label }: PillToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1 self-start"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            option.id === value
              ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
              : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
