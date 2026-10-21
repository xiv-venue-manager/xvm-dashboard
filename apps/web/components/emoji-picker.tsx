"use client"

import { useId, useRef, useState } from "react"
import emojiByChar from "unicode-emoji-json/data-by-emoji.json"
import orderedEmoji from "unicode-emoji-json/data-ordered-emoji.json"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
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
  /** Names the field where no visible label does, e.g. one row among many. */
  ariaLabel?: string
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
  ariaLabel,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [customEmoji, setCustomEmoji] = useState<DiscordEmojiOption[] | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const fetching = useRef(false)
  const openedByKeyboard = useRef(false)
  const popupId = useId()

  // On first open rather than on mount: a page renders one of these per role row, and a list
  // nobody has opened should not spend a request. A failure leaves `customEmoji` null so the next
  // open tries again, and `fetching` keeps a second click from firing a second request meanwhile.
  function handleOpen(viaKeyboard = false) {
    openedByKeyboard.current = viaKeyboard
    setOpen(true)
    if (customEmoji !== null || fetching.current) return
    fetching.current = true
    const url = source === "application" ? "/api/admin/discord/emojis" : `/api/venues/${venueId}/discord/emojis`
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { emojis: DiscordEmojiOption[] }) => {
        setCustomEmoji(data.emojis ?? [])
        setFetchFailed(false)
      })
      .catch(() => setFetchFailed(true))
      .finally(() => {
        fetching.current = false
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

  // Popover rather than a hand-rolled panel so the popup joins Radix's dismissable-layer stack:
  // inside a Dialog, the Dialog's own Escape handler is registered on the document in the capture
  // phase and only yields to a layer above it. A plain div is not a layer, so Escape in the picker
  // closed the whole dialog. The stack also brings outside-click, portalling and role="dialog".
  // Anchor, not Trigger: Trigger toggles on click, which would close the popup on the click that
  // repositions the caret.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex items-center gap-1.5", className)}>
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="relative">
            <Input
              aria-label={ariaLabel}
              // The anchor is not a trigger, so Radix wires none of this - and aria-expanded only
              // means anything on a widget that can expand. The popup holds a search box and
              // buttons rather than a list of options, so combobox + dialog, not listbox.
              role="combobox"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls={open ? popupId : undefined}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              // Click rather than focus: a row tabs colour, emoji, name, save, and opening on focus
              // would flash the picker open at every pass. Wrapped, not passed: handleOpen's first
              // parameter would otherwise receive the click event, which is truthy.
              onClick={() => handleOpen()}
              // The field is the only way in, so ArrowDown is the keyboard equivalent of clicking it.
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && !open) handleOpen(true)
              }}
              placeholder="🎉"
              maxLength={maxLength}
              disabled={disabled}
              // caret-foreground because text-transparent takes the caret with it: caret-color
              // defaults to currentColor, so the field would look unfocusable while a preview shows.
              className={cn("h-9 w-14 text-center text-sm", previewUrl && "text-transparent caret-foreground")}
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
        </PopoverAnchor>

        <PopoverContent
          id={popupId}
          aria-label="Emoji picker"
          align="start"
          className="p-2.5"
          // Opened by pointer, the caret belongs in the field: a paste straight after opening has
          // to land there, not in the search box. Opened with ArrowDown there is no caret to
          // protect, and leaving focus behind would make the popup unreachable - the content is
          // portaled, so Tab out of the field goes past it and dismisses on focus-outside.
          onOpenAutoFocus={(event) => {
            if (!openedByKeyboard.current) event.preventDefault()
          }}
          // Radix counts a press on the anchor as outside the content, and closing on it would
          // shut the popup on the same click that repositions the caret.
          onPointerDownOutside={(event) => {
            if (anchorRef.current?.contains(event.detail.originalEvent.target as Node)) event.preventDefault()
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji..."
            className="h-8 text-sm"
          />

          {/*
            A modal Dialog's scroll lock blocks wheel events on anything outside its own content,
            and this is portaled, so react-remove-scroll calls preventDefault and the list never
            scrolls. Its document listener is bubble-phase, so stopping here is enough.
          */}
          <div className="mt-2 max-h-64 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
            {matchedCustom.length > 0 && (
              <div className="mb-2">
                <div className={heading}>{source === "application" ? "Bot emoji" : "Server emoji"}</div>
                <div className="flex flex-wrap gap-1">
                  {matchedCustom.map((e) => (
                    <button key={e.id} type="button" title={e.name} onClick={() => pick(customEmojiMarkup(e))} className={swatch}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customEmojiCdnUrl(e)} alt={e.name} loading="lazy" className="h-6 w-6" />
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
                            <img src={e.cdnUrl} alt={e.name} loading="lazy" className="h-5 w-5" />
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
                            <img src={e.cdnUrl} alt={e.name} loading="lazy" className="h-5 w-5" />
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
        </PopoverContent>
      </div>
    </Popover>
  )
}
