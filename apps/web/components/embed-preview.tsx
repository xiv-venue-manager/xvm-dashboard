"use client"

import { format } from "date-fns"
import { useMounted } from "@/lib/use-mounted"
import type { EmbedDraft } from "@/lib/embed-draft"

const DEFAULT_BAR = "#4f545c"

export function EmbedPreview({ draft, botName = "XIV Venue Manager" }: { draft: EmbedDraft; botName?: string }) {
  const mounted = useMounted()
  const hasFooter = draft.footerText !== "" || draft.timestamp !== ""

  return (
    <div className="rounded-lg bg-[#313338] p-4 text-[#dbdee1]">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-9 w-9 rounded-full bg-[var(--xiv-blue)]" />
        <span className="text-sm font-semibold text-white">{botName}</span>
        <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold uppercase text-white">Bot</span>
      </div>

      <div className="ml-11 flex max-w-lg overflow-hidden rounded border-l-4" style={{ borderColor: draft.color || DEFAULT_BAR }}>
        <div className="min-w-0 flex-1 space-y-2 bg-[#2b2d31] p-3">
          {draft.authorName !== "" && (
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {draft.authorIconUrl !== "" && <img src={draft.authorIconUrl} alt="" className="h-6 w-6 rounded-full" />}
              <span className={draft.authorUrl !== "" ? "hover:underline" : ""}>{draft.authorName}</span>
            </div>
          )}

          {draft.title !== "" && (
            <p className={`break-words text-base font-semibold ${draft.url !== "" ? "text-[#00a8fc] hover:underline" : "text-white"}`}>
              {draft.title}
            </p>
          )}

          {draft.description !== "" && <p className="whitespace-pre-wrap break-words text-sm">{draft.description}</p>}

          {draft.fields.length > 0 && (
            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
              {draft.fields.map((field, index) => (
                <div key={index} className={field.inline ? "col-span-1" : "col-span-3"}>
                  <p className="break-words text-sm font-semibold text-white">{field.name}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{field.value}</p>
                </div>
              ))}
            </div>
          )}

          {draft.imageUrl !== "" && <img src={draft.imageUrl} alt="" className="max-h-72 max-w-full rounded" />}

          {hasFooter && (
            <div className="flex items-center gap-2 text-xs text-[#b5bac1]">
              {draft.footerIconUrl !== "" && <img src={draft.footerIconUrl} alt="" className="h-5 w-5 rounded-full" />}
              <span>
                {draft.footerText}
                {draft.footerText !== "" && draft.timestamp !== "" && mounted ? " • " : ""}
                {draft.timestamp !== "" && mounted ? format(new Date(draft.timestamp), "PP p") : ""}
              </span>
            </div>
          )}
        </div>

        {draft.thumbnailUrl !== "" && (
          <div className="bg-[#2b2d31] p-3 pl-0">
            <img src={draft.thumbnailUrl} alt="" className="h-16 w-16 rounded object-cover" />
          </div>
        )}
      </div>
    </div>
  )
}
