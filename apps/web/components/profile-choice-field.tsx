"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CUSTOM, PROFILE_LIMITS, PRONOUNS, pronounKeys, pronounsToString } from "@/lib/profiles"

const NOT_SET = "__none__"

export interface ChoiceFieldProps {
  id: string
  label: string
  choices: Record<string, string>
  value: string
  custom: string
  onChange: (value: string, custom: string) => void
  disabled: boolean
}

/** A pick-list with a Custom entry that opens a free-text box, as the bot's At-A-Glance screen does. */
export function ChoiceField({ id, label, choices, value, custom, onChange, disabled }: ChoiceFieldProps) {
  const known = value === "" || value in choices
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value === "" ? NOT_SET : value}
        onValueChange={(next) => onChange(next === NOT_SET ? "" : next, next === CUSTOM ? custom : "")}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_SET}>Not set</SelectItem>
          {Object.entries(choices).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
          {!known && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
      {value === CUSTOM && (
        <Input
          aria-label={`${label}, custom`}
          value={custom}
          maxLength={PROFILE_LIMITS.custom}
          onChange={(e) => onChange(CUSTOM, e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

export interface PronounFieldProps {
  value: string
  custom: string
  onChange: (value: string, custom: string) => void
  disabled: boolean
}

/** Any combination of the bot's pronouns, kept in the list's order, plus free text. */
export function PronounField({ value, custom, onChange, disabled }: PronounFieldProps) {
  const picked = pronounKeys(value)

  function toggle(key: string) {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]
    onChange(pronounsToString(next) ?? "", custom)
  }

  return (
    <div className="space-y-2">
      <Label>Pronouns</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pronouns">
        {Object.entries(PRONOUNS).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={picked.includes(key)}
            disabled={disabled}
            onClick={() => toggle(key)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              picked.includes(key)
                ? "border-[var(--xiv-blue)] bg-[var(--blue-018)] text-[var(--xiv-blue)]"
                : "border-[var(--blue-018)] text-muted-foreground hover:text-foreground"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      <Input
        aria-label="Pronouns, custom"
        placeholder="Anything else"
        value={custom}
        maxLength={PROFILE_LIMITS.custom}
        onChange={(e) => onChange(value, e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
