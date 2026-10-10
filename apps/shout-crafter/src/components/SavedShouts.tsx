import { useState, useEffect } from "react"
import type { ShoutFields, TemplateId } from "../types"
import type { SeparatorId, DecorId } from "../lib/shout-templates"
import { fetchShouts, saveShout, deleteShout } from "../lib/xivvm-shouts"
import type { FetchShoutsResult } from "../lib/xivvm-shouts"
import { buildShout } from "../lib/shout-templates"
import { Bookmark, Trash2 } from "lucide-react"

interface Props {
  currentFields: ShoutFields
  currentTemplate: TemplateId
  currentSeparator: SeparatorId
  currentDecor: DecorId
  onLoad: (fields: ShoutFields, templateId: TemplateId, separatorId: SeparatorId, decorId: DecorId) => void
}

const inputClass =
  "flex-1 bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors"

const ghostBtn =
  "px-3 py-1.5 bg-[var(--blue-006)] text-[var(--muted-foreground)] text-sm font-medium rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors"

const primaryBtn =
  "px-3 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] hover:opacity-90 disabled:opacity-50 transition-opacity"

export function SavedShouts({ currentFields, currentTemplate, currentSeparator, currentDecor, onLoad }: Props) {
  const [loaded, setLoaded] = useState<FetchShoutsResult | null>(null)
  const [label, setLabel] = useState("")
  const [saving, setS] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchShouts().then(setLoaded)
  }, [])

  function retry() {
    setLoaded(null)
    fetchShouts().then(setLoaded)
  }

  async function handleSave() {
    if (!label.trim()) return
    setS(true)
    setError(null)
    const result = await saveShout({
      label: label.trim(),
      fields: currentFields,
      templateId: currentTemplate,
      separatorId: currentSeparator,
      decorId: currentDecor,
    })
    setS(false)
    if (!result.ok) {
      setError(
        result.reason === "signed_out"
          ? "Your session has expired. Sign in again to save."
          : result.reason === "rejected"
            ? (result.message ?? "That shout could not be saved.")
            : "Save failed. Try again in a moment."
      )
      return
    }
    setLoaded((prev) => (prev?.ok ? { ok: true, shouts: [result.shout, ...prev.shouts] } : prev))
    setLabel("")
    setShowSave(false)
  }

  async function handleDelete(id: string) {
    await deleteShout(id)
    setLoaded((prev) => (prev?.ok ? { ok: true, shouts: prev.shouts.filter((s) => s.id !== id) } : prev))
  }

  return (
    <div className="xiv-card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[0.625rem] bg-[var(--blue-010)] flex items-center justify-center shrink-0">
            <Bookmark size={18} className="text-[var(--xiv-blue)]" />
          </div>
          <div>
            <h2
              className="font-semibold text-[1.02rem] text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              My shouts
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">Saved across your venues</p>
          </div>
        </div>
        <button onClick={() => setShowSave((s) => !s)} className={ghostBtn}>
          Save this
        </button>
      </div>

      {showSave && (
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Name this shout…"
            autoFocus
            className={inputClass}
          />
          <button onClick={handleSave} disabled={saving || !label.trim()} className={primaryBtn}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

      {loaded === null ? (
        <p className="text-xs text-[var(--fg-faint)]">Loading your shouts…</p>
      ) : !loaded.ok ? (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-[var(--destructive)]">
            {loaded.reason === "signed_out"
              ? "Your session has expired. Sign in again to see your saved shouts."
              : "Couldn't load your saved shouts. Try again in a moment."}
          </p>
          {loaded.reason === "unavailable" && (
            <button onClick={retry} className={ghostBtn}>
              Retry
            </button>
          )}
        </div>
      ) : loaded.shouts.length === 0 ? (
        <p className="text-xs text-[var(--fg-faint)]">Nothing saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {loaded.shouts.map((s) => (
            <li key={s.id} className="flex items-start gap-2 bg-[var(--blue-004)] rounded-[0.5rem] p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.label}</p>
                <p
                  className="text-xs text-[var(--fg-faint)] truncate mt-0.5"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {buildShout(s.fields, s.templateId, s.separatorId, s.decorId).slice(0, 80)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onLoad(s.fields, s.templateId, s.separatorId, s.decorId)}
                  className="px-2 py-1 text-xs bg-[var(--blue-006)] text-[var(--xiv-blue)] rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="flex items-center justify-center px-2 py-1 text-xs bg-[var(--destructive-soft)] text-[var(--destructive)] rounded-[0.5rem] hover:bg-[rgba(243,139,168,0.15)] transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
