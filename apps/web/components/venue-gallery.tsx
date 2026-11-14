"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { stepIndex } from "@/lib/gallery-nav"

interface VenueGalleryProps {
  images: string[]
  name: string
}

const ARROW_CLASS =
  "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-primary focus-visible:bg-primary"

export function VenueGallery({ images, name }: VenueGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const step = (by: number) => setOpenIndex((i) => (i === null ? i : stepIndex(i, images.length, by)))

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") step(-1)
    if (e.key === "ArrowRight") step(1)
  }

  return (
    <>
      <div className="gallery">
        {images.map((url, i) => (
          <button
            key={url}
            type="button"
            className="gtile cursor-pointer"
            onClick={() => setOpenIndex(i)}
            aria-label={`Open image ${i + 1} of ${images.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${name} gallery ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
          </button>
        ))}
      </div>

      <Dialog open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] p-2 sm:max-w-5xl"
          overlayClassName="bg-black/90"
          onKeyDown={onKeyDown}
        >
          <DialogTitle className="sr-only">{name} gallery</DialogTitle>
          <DialogDescription className="sr-only">
            Image {(openIndex ?? 0) + 1} of {images.length}. Select the image to open it in a new tab.
          </DialogDescription>
          {openIndex !== null && (
            <div className="relative">
              <a href={images[openIndex]} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[openIndex]}
                  alt={`${name} gallery ${openIndex + 1}`}
                  className="max-h-[80vh] w-full rounded-md object-contain"
                />
              </a>
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Previous image" className={`${ARROW_CLASS} left-2`}>
                    <ChevronLeft className="size-6" />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next image" className={`${ARROW_CLASS} right-2`}>
                    <ChevronRight className="size-6" />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    {openIndex + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
