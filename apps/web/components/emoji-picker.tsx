"use client"

import { useEffect, useRef, useState } from "react"
import emojiByChar from "unicode-emoji-json/data-by-emoji.json"
import orderedEmoji from "unicode-emoji-json/data-ordered-emoji.json"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  customEmojiCdnUrl,
  customEmojiMarkup,
  parseCustomEmojiMarkup,
  twemojiCdnUrl,
  type DiscordEmojiOption,
} from "@/lib/emoji"

// Ported from FroggeBot Dashboard (src/components/EmojiPicker.tsx). Adapted: controlled
// value/onChange rather than an uncontrolled form field, XVM's ui primitives and tokens, and
// XVM's `{ emojis }` response envelope.

interface UnicodeEmojiEntry {
  char: string
  name: string
  group: string
  cdnUrl: string | null
}

// Resolved once at module load, not per render: ~1,900 entries that each resolve to the same URL
// every time.
const UNICODE_EMOJI: UnicodeEmojiEntry[] = (orderedEmoji as string[]).map((char) => {
  const entry = (emojiByChar as Record<string, { name: string; group: string }>)[char]
  return { char, name: entry?.name ?? "", group: entry?.group ?? "Other", cdnUrl: twemojiCdnUrl(char) }
})

// Discord's own category order, so browsing with an empty search feels like the same set.
const GROUP_ORDER = [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
]

interface EmojiPickerProps {
  value: string
  onChange: (value: string) => void
  /** Required when `source` is "venue". A platform surface has no venue and uses "application". */
  venueId?: string
  source?: "venue" | "application"
  maxLength?: number
  disabled?: boolean
  className?: string
}

/**
 * An emoji field: a text input that still takes a typed or pasted value, with a picker beside it.
 * Discord renders a Unicode character and a `<:name:id>` markup string alike, so the field's value
 * is the string the caller stores - no hidden input or id indirection.
 */
export function EmojiPicker({
  value,
  onChange,
  venueId,
  source = "venue",
  maxLength,
  disabled,
  className,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [focusSearch, setFocusSearch] = useState(false)
  const [query, setQuery] = useState("")
  const [customEmoji, setCustomEmoji] = useState<DiscordEmojiOption[] | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  // On first open rather than on mount: a page renders one of these per role row, and a list
  // nobody has opened should not spend a request.
  //
  // `searchFirst` is false when the field itself was clicked: the search box autofocuses, and
  // stealing the caret out of a field somebody just clicked into would break typing and paste,
  // which is the half of this control the picker is meant to add to rather than replace.
  function handleOpen(searchFirst: boolean) {
    setFocusSearch(searchFirst)
    setOpen(true)
    if (customEmoji !== null) return
    const url = source === "application" ? "/api/admin/discord/emojis" : `/api/venues/${venueId}/discord/emojis`
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { emojis: DiscordEmojiOption[] }) => setCustomEmoji(data.emojis ?? []))
      .catch(() => {
        setCustomEmoji([])
        setFetchFailed(true)
      })
  }

  const lowerQuery = query.trim().toLowerCase()
  const matchedCustom = (customEmoji ?? []).filter((e) => e.name.toLowerCase().includes(lowerQuery))
  const matchedUnicode = UNICODE_EMOJI.filter((e) => e.name.toLowerCase().includes(lowerQuery))
  // No query: browse grouped by category. With one: a flat list, uncapped - the whole set is
  // small enough to render, so a real match is never hidden behind a result limit.
  const groupedUnicode =
    lowerQuery === ""
      ? GROUP_ORDER.map((group) => ({ group, emoji: matchedUnicode.filter((e) => e.group === group) })).filter(
          (g) => g.emoji.length > 0
        )
      : null

  function pick(picked: string) {
    onChange(picked)
    setOpen(false)
    setQuery("")
  }

  // One image, never a glyph and an image at once: Segoe UI Emoji draws a visibly different
  // style than Twemoji, and the two stacked in one box read as two overlapping emoji. Plain text
  // stays visible only while a value resolves to nothing, e.g. mid-typing.
  const customPreview = parseCustomEmojiMarkup(value)
  const previewUrl = customPreview ? customEmojiCdnUrl(customPreview) : value ? twemojiCdnUrl(value) : null

  const swatch =
    "rounded-md p-1 hover:bg-[var(--blue-007)] disabled:opacity-50 disabled:pointer-events-none"
  const heading = "mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"

  return (
    <div ref={wrapperRef} className={cn("relative flex items-center gap-1.5", className)}>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Click rather than focus: a row tabs colour, emoji, name, save, and opening on focus
          // would flash the picker open at every pass. Typing still works with it open.
          onClick={() => handleOpen(false)}
          placeholder="🎉"
          maxLength={maxLength}
          disabled={disabled}
          className={cn("h-9 w-14 text-center text-sm", previewUrl && "text-transparent")}
        />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={customPreview?.name ?? ""}
            className="pointer-events-none absolute inset-0 m-auto h-5 w-5"
          />
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : handleOpen(true))}
      >
        Pick
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-[var(--blue-015)] bg-background p-2.5 shadow-md">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji..."
            autoFocus={focusSearch}
            className="h-8 text-sm"
          />

          <div className="mt-2 max-h-64 overflow-y-auto">
            {matchedCustom.length > 0 && (
              <div className="mb-2">
                <div className={heading}>{source === "application" ? "Bot emoji" : "Server emoji"}</div>
                <div className="flex flex-wrap gap-1">
                  {matchedCustom.map((e) => (
                    <button key={e.id} type="button" title={e.name} onClick={() => pick(customEmojiMarkup(e))} className={swatch}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customEmojiCdnUrl(e)} alt={e.name} className="h-6 w-6" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fetchFailed && (
              <div className="mb-2 text-[11px] text-muted-foreground">
                {source === "application" ? "Couldn't load the bot's emoji." : "Couldn't load this server's emoji."}
              </div>
            )}

            {groupedUnicode
              ? groupedUnicode.map(({ group, emoji }) => (
                  <div key={group} className="mb-2">
                    <div className={heading}>{group}</div>
                    <div className="flex flex-wrap gap-1">
                      {emoji.map((e) => (
                        <button key={e.char} type="button" title={e.name} onClick={() => pick(e.char)} className={swatch}>
                          {e.cdnUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.cdnUrl} alt={e.name} className="h-5 w-5" />
                          ) : (
                            <span className="text-lg">{e.char}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              : (
                  <>
                    <div className={heading}>Emoji</div>
                    <div className="flex flex-wrap gap-1">
                      {matchedUnicode.map((e) => (
                        <button key={e.char} type="button" title={e.name} onClick={() => pick(e.char)} className={swatch}>
                          {e.cdnUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.cdnUrl} alt={e.name} className="h-5 w-5" />
                          ) : (
                            <span className="text-lg">{e.char}</span>
                          )}
                        </button>
                      ))}
                      {matchedUnicode.length === 0 && matchedCustom.length === 0 && (
                        <div className="text-[12px] text-muted-foreground">No matches.</div>
                      )}
                    </div>
                  </>
                )}
          </div>
        </div>
      )}
    </div>
  )
}
