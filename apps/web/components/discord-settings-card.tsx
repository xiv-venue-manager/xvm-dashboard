"use client"

import { useEffect, useState } from "react"
import { CalendarDays, DoorOpen, ShieldAlert, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DiscordOptionPicker, useDiscordOptions } from "@/components/discord-picker"
import { channelProblem } from "@/lib/discord-picker-state"
import { apiFetch, ApiError } from "@/lib/api-fetch"

type Field = "honeypotChannelId" | "eventsChannelId" | "roomsChannelId"
type Values = Record<Field, string | null>

const FIELDS: { key: Field; noun: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    key: "honeypotChannelId",
    noun: "honeypot",
    icon: ShieldAlert,
    label: "Honeypot channel",
    description:
      "Anyone without server powers who posts here is banned. The bot needs Ban Members and Manage Messages in your server, and the trap does nothing until a channel is set.",
  },
  {
    key: "eventsChannelId",
    noun: "events",
    icon: CalendarDays,
    label: "Events channel",
    description: "Where the bot posts a published event.",
  },
  {
    key: "roomsChannelId",
    noun: "rooms",
    icon: DoorOpen,
    label: "Rooms channel",
    description: "Where the bot posts rooms. Nothing posts until a channel is set.",
  },
]

export function DiscordSettingsCard({ venueSlug }: { venueSlug: string }) {
  const [saved, setSaved] = useState<Values | null>(null)
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({})
  const [busy, setBusy] = useState<Field | null>(null)
  const [arming, setArming] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { refresh, ...channels } = useDiscordOptions(venueSlug, "channels")

  useEffect(() => {
    apiFetch<Values>(`/api/venues/${venueSlug}/discord/settings`)
      .then(setSaved)
      .catch(() => setLoadFailed(true))
  }, [venueSlug, attempt])

  async function write(key: Field, value: string | null) {
    setBusy(key)
    try {
      setSaved(
        await apiFetch<Values>(`/api/venues/${venueSlug}/discord/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        })
      )
      setDraft((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      toast.success(value === null ? "Channel cleared." : "Channel saved. The bot picks it up within a minute.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the channel.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {loadFailed && (
        <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
          <p className="pl-[54px] text-xs text-[var(--fg-faint)]">
            Couldn&apos;t load the saved channels.{" "}
            <button
              type="button"
              onClick={() => {
                setLoadFailed(false)
                setAttempt((n) => n + 1)
              }}
              className="text-[var(--xiv-blue)] hover:underline"
            >
              Try again
            </button>
          </p>
        </div>
      )}
      {channels.problem && (
        <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
          <p className="pl-[54px] text-xs text-[var(--fg-faint)]">
            {channels.problem.message} You can still paste a channel id below.
            {channels.problem.retryable && (
              <>
                {" "}
                <button type="button" onClick={refresh} className="text-[var(--xiv-blue)] hover:underline">
                  Try again
                </button>
              </>
            )}
          </p>
        </div>
      )}
      {FIELDS.map(({ key, noun, label, description, icon: Icon }) => {
        const current = saved?.[key] ?? ""
        const value = draft[key] ?? current
        const changed = value !== current
        return (
          <div key={key} className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
            <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
              <Icon />
            </span>
            <div className="iinfo min-w-0 flex-1">
              <div className="iname">{label}</div>
              <div className="idesc">{description}</div>
            </div>
            <div className="w-full pl-[54px]">
              <DiscordOptionPicker
                options={channels.options}
                loading={channels.loading}
                problem={channelProblem(noun, value, channels)}
                onRefresh={refresh}
                value={value}
                onChange={(next) => setDraft((d) => ({ ...d, [key]: next }))}
                disabled={saved === null || busy !== null}
                placeholder="Choose a channel"
                ariaLabel={label}
                className="h-8 w-56"
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="outline-blue"
                      disabled={!changed || value === "" || busy !== null}
                      onClick={() => (key === "honeypotChannelId" ? setArming(value) : write(key, value))}
                    >
                      {busy === key ? "Saving..." : "Save"}
                    </Button>
                    {current !== "" && (
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => write(key, null)}>
                        Clear
                      </Button>
                    )}
                  </>
                }
              />
            </div>
          </div>
        )
      })}
      <AlertDialog open={arming !== null} onOpenChange={(open) => !open && setArming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arm the trap?</AlertDialogTitle>
            <AlertDialogDescription>
              Within a minute, the bot bans anyone without server powers who posts in{" "}
              {arming !== null && (channels.options.find((o) => o.value === arming)?.label ?? `channel ${arming}`)} and
              removes their last 15 minutes of messages. Make sure it isn&apos;t a channel people chat in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (arming !== null) void write("honeypotChannelId", arming)
              }}
            >
              Arm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
