"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { memberQueryReady, memberSearchProblem, type PickerProblem } from "@/lib/discord-picker-state"

interface Member {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

const SEARCH_DELAY_MS = 250

function Avatar({ url }: { url: string | null }) {
  if (!url) return <span aria-hidden className="size-5 shrink-0 rounded-full bg-muted" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-5 shrink-0 rounded-full" />
}

/**
 * A Discord user, found by typing part of their name, or entered as an id.
 *
 * A search box and never a list: the members route is a prefix search because the bot has no
 * member-list intent, and a server can have thousands of members. Controlled, like the role and
 * channel pickers, because every call site holds the value in React state.
 *
 * Entering an id stays reachable, and takes over by itself when search cannot work for this venue
 * (no server connected, bot absent, no access). Otherwise a person who cannot search would be
 * left with a box that never returns anything.
 */
export function UserPicker({
  venueId,
  value,
  onChange,
  disabled,
  id,
}: {
  venueId: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}) {
  const listboxId = useId()
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<Member | null>(null)
  const [results, setResults] = useState<Member[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [searching, setSearching] = useState(false)
  const [problem, setProblem] = useState<PickerProblem | null>(null)
  const [manual, setManual] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePress)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress)
  }, [])

  async function search(text: string) {
    abortRef.current?.abort()
    if (!memberQueryReady(text)) {
      setResults([])
      setProblem(null)
      setSearching(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/discord/members?q=${encodeURIComponent(text.trim())}`, {
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setProblem(memberSearchProblem(res.status, body))
        setResults([])
        return
      }
      setProblem(null)
      setResults(body.members ?? [])
      setHighlighted(0)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setProblem({ message: "Couldn't reach the server.", retryable: true })
      setResults([])
    } finally {
      if (abortRef.current === controller) setSearching(false)
    }
  }

  function handleType(text: string) {
    setQuery(text)
    setOpen(true)
    if (value !== "") {
      setPicked(null)
      onChange("")
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void search(text), SEARCH_DELAY_MS)
  }

  function pick(member: Member) {
    setPicked(member)
    setQuery("")
    setOpen(false)
    onChange(member.id)
  }

  function clear() {
    setPicked(null)
    onChange("")
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      pick(results[highlighted])
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  const searchBroken = problem !== null && !problem.retryable

  if (manual || searchBroken || (value !== "" && picked === null)) {
    return (
      <div className="w-full space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            maxLength={20}
            placeholder="123456789012345678"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-label="Discord user ID"
          />
          {!searchBroken && (
            <button
              type="button"
              onClick={() => {
                setManual(false)
                if (picked === null) onChange("")
              }}
              className="text-xs text-[var(--xiv-blue)] hover:underline"
            >
              Search instead
            </button>
          )}
        </div>
        {problem && <p className="text-xs text-[var(--fg-faint)]">{problem.message}</p>}
      </div>
    )
  }

  if (picked !== null && value === picked.id) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <Avatar url={picked.avatarUrl} />
          <span className="truncate">{picked.displayName}</span>
          <span className="truncate text-xs text-muted-foreground">@{picked.username}</span>
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="text-xs text-[var(--xiv-blue)] hover:underline"
        >
          Change
        </button>
      </div>
    )
  }

  const ready = memberQueryReady(query)

  return (
    <div ref={wrapperRef} className="relative w-full space-y-1">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Start typing a username…"
        value={query}
        onChange={(event) => handleType(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {!ready && <p className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters to search.</p>}
          {ready && searching && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
          {ready && !searching && problem?.retryable && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {problem.message}{" "}
              <button type="button" onClick={() => void search(query)} className="text-[var(--xiv-blue)] hover:underline">
                Try again
              </button>
            </p>
          )}
          {ready && !searching && !problem && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No members found.</p>
          )}
          {results.length > 0 && !searching && (
            <ul id={listboxId} role="listbox">
              {results.map((member, index) => (
                <li
                  key={member.id}
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    pick(member)
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                    index === highlighted ? "bg-accent text-accent-foreground" : ""
                  }`}
                >
                  <Avatar url={member.avatarUrl} />
                  <span className="truncate">{member.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">@{member.username}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" onClick={() => setManual(true)} disabled={disabled} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
        Enter ID
      </button>
    </div>
  )
}
