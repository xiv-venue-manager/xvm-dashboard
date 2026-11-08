"use client"

import { useEffect, useState } from "react"
import { BadgeCheck, Fingerprint, ShieldCheck, Tag } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { RolePicker } from "@/components/discord-picker"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import { verificationWarnings, type LodestoneCheck, type VerificationSettings } from "@/lib/venue-verification"

type Field = keyof VerificationSettings

const LODESTONE_OPTIONS: { value: LodestoneCheck; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No Lodestone check." },
  { value: "exists", label: "Character exists", description: "The character must exist on the Lodestone." },
  { value: "code", label: "Code in bio", description: "The member puts a code in their Lodestone profile." },
]

export function VerificationSettingsCard({ venueSlug }: { venueSlug: string }) {
  const [saved, setSaved] = useState<VerificationSettings | null>(null)
  const [roleDraft, setRoleDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<Field | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    apiRoute<VerificationSettings>("/api/venues/[venueId]/discord/settings", { params: { venueId: venueSlug } })
      .then(setSaved)
      .catch(() => setLoadFailed(true))
  }, [venueSlug, attempt])

  async function write(field: Field, changes: Partial<VerificationSettings>, success: string) {
    setBusy(field)
    try {
      setSaved(
        await apiRoute<VerificationSettings>("/api/venues/[venueId]/discord/settings", {
          params: { venueId: venueSlug },
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        })
      )
      if (field === "verifiedRoleId") setRoleDraft(null)
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the verification settings.")
    } finally {
      setBusy(null)
    }
  }

  const locked = saved === null || busy !== null
  const roleCurrent = saved?.verifiedRoleId ?? ""
  const roleValue = roleDraft ?? roleCurrent
  const warnings = saved ? verificationWarnings(saved) : []
  const lodestoneOn = saved !== null && saved.verificationLodestone !== "off"

  return (
    <>
      {loadFailed && (
        <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
          <p className="pl-[54px] text-xs text-[var(--fg-faint)]">
            Couldn&apos;t load the verification settings.{" "}
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
      {warnings.length > 0 && (
        <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
          <ul className="list-disc space-y-1 pl-[72px] text-xs text-[var(--fg-faint)]">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
          <BadgeCheck />
        </span>
        <div className="iinfo min-w-0 flex-1">
          <div className="iname">Verified role</div>
          <div className="idesc">The role members get once they pass verification. Roles above the bot, and roles with moderation powers, are hidden.</div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 pl-[54px]">
          <RolePicker
            venueId={venueSlug}
            value={roleValue}
            onChange={setRoleDraft}
            forVerification
            disabled={locked}
            className="h-8 w-56"
          />
          <Button
            size="sm"
            variant="outline-blue"
            disabled={locked || roleDraft === null || roleDraft === roleCurrent || roleDraft === ""}
            onClick={() => write("verifiedRoleId", { verifiedRoleId: roleDraft }, "Verified role saved.")}
          >
            {busy === "verifiedRoleId" ? "Saving..." : "Save"}
          </Button>
          {roleCurrent !== "" && (
            <Button
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => write("verifiedRoleId", { verifiedRoleId: null }, "Verified role cleared.")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
          <ShieldCheck />
        </span>
        <div className="iinfo min-w-0 flex-1">
          <div className="iname">Captcha</div>
          <div className="idesc">New members solve a captcha before they get the verified role.</div>
        </div>
        <Switch
          aria-label="Captcha"
          checked={saved?.verificationCaptcha ?? false}
          disabled={locked}
          onCheckedChange={(on) =>
            write("verificationCaptcha", { verificationCaptcha: on }, on ? "Captcha turned on." : "Captcha turned off.")
          }
        />
      </div>
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
          <Fingerprint />
        </span>
        <div className="iinfo min-w-0 flex-1">
          <div className="iname">Lodestone check</div>
          <div className="idesc">Ask members to prove they own the character they claim.</div>
        </div>
        <div role="radiogroup" aria-label="Lodestone check" className="w-full space-y-2 pl-[54px]">
          {LODESTONE_OPTIONS.map(({ value, label, description }) => {
            const selected = saved?.verificationLodestone === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() =>
                  !selected && write("verificationLodestone", { verificationLodestone: value }, "Lodestone check saved.")
                }
                className={cn(
                  "block w-full max-w-md rounded-md border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
                  selected ? "border-[var(--xiv-blue)]" : "border-[var(--border)] hover:border-[var(--xiv-blue)]"
                )}
              >
                <div className="text-sm">{label}</div>
                <div className="text-xs text-[var(--fg-faint)]">{description}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="introw" style={{ flexWrap: "wrap", gap: 14 }}>
        <span className="iconbadge ii" style={{ width: 40, height: 40 }}>
          <Tag />
        </span>
        <div className="iinfo min-w-0 flex-1">
          <div className="iname">Change Nickname</div>
          <div className="idesc">
            {lodestoneOn
              ? "Rename verified members to their character name."
              : "Turn on the Lodestone check to use this."}
          </div>
        </div>
        <Switch
          aria-label="Change Nickname"
          checked={saved?.verificationNickname ?? false}
          disabled={locked || (!lodestoneOn && !saved?.verificationNickname)}
          onCheckedChange={(on) =>
            write(
              "verificationNickname",
              { verificationNickname: on },
              on ? "Change Nickname turned on." : "Change Nickname turned off."
            )
          }
        />
      </div>
    </>
  )
}
