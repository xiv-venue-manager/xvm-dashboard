"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  pickerProblem,
  offeredRoles,
  showsManualEntry,
  canReturnToList,
  type DiscordOption,
  type PickerProblem,
} from "@/lib/discord-picker-state"

type Resource = "roles" | "channels"

interface Loaded {
  options: DiscordOption[]
  loading: boolean
  problem: PickerProblem | null
  refresh: () => void
}

/**
 * Loads a venue's Discord roles or channels from the routes PR 1 added.
 *
 * Fetches once the field can actually be used, and on an explicit refresh, never per render:
 * these lists back a form field, so a re-render on every keystroke must not re-ask Discord.
 * `refresh` passes `?refresh=1` so somebody who just made a role in Discord is not told to wait
 * five minutes for the cache.
 *
 * `enabled` is why this is not just an on-mount fetch. The reaction-role dialog mounts its option
 * fields disabled until the panel is saved, and fetching there spends a Discord call and a cache
 * write on a list nobody can open yet.
 */
export function useDiscordOptions(venueId: string, resource: Resource, enabled = true): Loaded {
  const [options, setOptions] = useState<DiscordOption[]>([])
  const [loading, setLoading] = useState(enabled)
  const [problem, setProblem] = useState<PickerProblem | null>(null)

  const load = useCallback(
    async (fresh: boolean) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/venues/${venueId}/discord/${resource}${fresh ? "?refresh=1" : ""}`)
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setProblem(pickerProblem(res.status, body))
          setOptions([])
          return
        }
        setProblem(null)
        setOptions(
          resource === "roles"
            ? (body.roles ?? []).map((r: { id: string; name: string; color: number; unsafeReason: string | null }) => ({
                value: r.id,
                label: r.name,
                color: r.color,
                note: r.unsafeReason,
              }))
            : (body.channels ?? []).map((c: { id: string; name: string }) => ({
                value: c.id,
                label: `#${c.name}`,
              }))
        )
      } catch {
        setProblem({ message: "Couldn't reach the server.", retryable: true })
        setOptions([])
      } finally {
        setLoading(false)
      }
    },
    [venueId, resource]
  )

  // Once per venue and resource, not once per enable. The reaction-role dialog flips `disabled`
  // around every option add and delete, and re-running this on each of them meant an extra
  // roles-route call and the dropdown being replaced by "Loading..." after every add. Refreshing
  // stays explicit.
  const attempted = useRef<string | null>(null)
  const key = `${venueId}:${resource}`
  useEffect(() => {
    if (!enabled || attempted.current === key) return
    attempted.current = key
    void load(false)
  }, [load, enabled, key])

  return { options, loading, problem, refresh: () => void load(true) }
}

function Swatch({ color }: { color?: number }) {
  if (!color) return null
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: `#${color.toString(16).padStart(6, "0")}` }}
    />
  )
}

/**
 * A Discord id, picked from a list or typed in.
 *
 * Controlled, because every call site holds the value in React state inside a dialog. Frogge's
 * PickerField is uncontrolled and submits through a form `name`, which none of them can use.
 *
 * Typing one in is always reachable, and not as a nicety: with one bot token a venue whose server
 * the bot has not joined has no list at all, and the field still has to be fillable. When the list
 * is missing the picker says why instead of rendering an empty dropdown.
 */
export function DiscordOptionPicker({
  value,
  onChange,
  options,
  loading,
  problem,
  onRefresh,
  disabled,
  placeholder,
  ariaLabel,
  id,
  className,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder: string
  ariaLabel: string
  id?: string
  className?: string
} & Omit<Loaded, "refresh"> & { onRefresh: () => void }) {
  const [manual, setManual] = useState(false)
  const unlisted = value !== "" && !options.some((option) => option.value === value)
  const showManual = showsManualEntry({ requested: manual, disabled, problem, loading, options, value })

  if (loading && !showManual) {
    return <p className="text-xs text-[var(--fg-faint)]">Loading…</p>
  }

  if (showManual) {
    return (
      <div className="w-full space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={20}
            aria-label={ariaLabel}
            className={cn("w-44", className)}
          />
          {canReturnToList(options, value) && (
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-xs text-[var(--xiv-blue)] hover:underline"
            >
              Pick from list
            </button>
          )}
          {problem?.retryable && (
            <button type="button" onClick={onRefresh} className="text-xs text-[var(--xiv-blue)] hover:underline">
              Try again
            </button>
          )}
        </div>
        {problem && <p className="text-xs text-[var(--fg-faint)]">{problem.message}</p>}
        {!problem && unlisted && (
          <p className="text-xs text-[var(--fg-faint)]">This id isn&apos;t in the server&apos;s list.</p>
        )}
      </div>
    )
  }

  const selected = options.find((option) => option.value === value)

  return (
    <div className="w-full space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} size="sm" className={cn("w-44", className)} aria-label={ariaLabel}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <Swatch color={option.color} />
                <span className="truncate">{option.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" onClick={onRefresh} className="text-xs text-[var(--xiv-blue)] hover:underline">
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
        >
          Enter ID
        </button>
      </div>
      {selected?.note && <p className="text-xs text-destructive">Careful: {selected.note}.</p>}
    </div>
  )
}

/**
 * Roles the venue's Discord server can hand out.
 *
 * Unsafe roles are dropped from the list, except one already saved on this row: a row holding
 * @everyone or an Administrator role has to keep showing it, or re-saving an unrelated field
 * silently rewrites it to whatever sits first in the dropdown.
 */
export function RolePicker({
  venueId,
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  venueId: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  className?: string
}) {
  const { options, loading, problem, refresh } = useDiscordOptions(venueId, "roles", !disabled)
  const offered = offeredRoles(options, value)

  return (
    <DiscordOptionPicker
      value={value}
      onChange={onChange}
      options={offered}
      loading={loading}
      problem={problem}
      onRefresh={refresh}
      disabled={disabled}
      placeholder="Role ID"
      ariaLabel="Discord role"
      id={id}
      className={className}
    />
  )
}

/** Text channels the bot can post in. */
export function ChannelPicker({
  venueId,
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  venueId: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  className?: string
}) {
  const { options, loading, problem, refresh } = useDiscordOptions(venueId, "channels", !disabled)

  return (
    <DiscordOptionPicker
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      problem={problem}
      onRefresh={refresh}
      disabled={disabled}
      placeholder="Channel ID"
      ariaLabel="Discord channel"
      id={id}
      className={className}
    />
  )
}
