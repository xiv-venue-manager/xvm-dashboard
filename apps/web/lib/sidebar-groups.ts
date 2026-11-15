import { useCallback, useSyncExternalStore } from "react"

const KEY = "xvm-sidebar-groups"

/** What a person chose for each group. A group they never touched has no entry. */
export type GroupChoices = Record<string, boolean>

export function parseChoices(raw: string): GroupChoices {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "boolean"))
  } catch {
    return {}
  }
}

/** A choice wins; with none, a group is open only when it holds the page being viewed. */
export function isGroupOpen(choices: GroupChoices, label: string, holdsActivePage: boolean): boolean {
  return choices[label] ?? holdsActivePage
}

export function withChoice(raw: string, label: string, open: boolean): string {
  return JSON.stringify({ ...parseChoices(raw), [label]: open })
}

const listeners = new Set<() => void>()
let memory = ""

// Storage can throw (private window, blocked site data). The in-memory copy keeps the toggles working
// for the life of the page when it does.
function read(): string {
  try {
    return localStorage.getItem(KEY) ?? memory
  } catch {
    return memory
  }
}

function write(raw: string) {
  memory = raw
  try {
    localStorage.setItem(KEY, raw)
  } catch {
    // keep the in-memory copy
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** Landing on a page opens its group again, if the group had been collapsed by hand. */
export function ensureOpen(label: string) {
  const raw = read()
  if (parseChoices(raw)[label] === false) write(withChoice(raw, label, true))
}

/** The server renders with no choices, so the first paint is the same on both sides. */
export function useGroupChoices(): { choices: GroupChoices; setOpen: (label: string, open: boolean) => void } {
  const raw = useSyncExternalStore(subscribe, read, () => "")
  const setOpen = useCallback((label: string, open: boolean) => write(withChoice(read(), label, open)), [])
  return { choices: parseChoices(raw), setOpen }
}
