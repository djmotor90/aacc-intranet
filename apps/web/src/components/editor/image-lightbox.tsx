"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ImageLightboxTarget = {
  src: string;
  alt: string;
};

/** Full-size preview for images in comments, activity, and other read-only docs. */
export function ImageLightbox({
  image,
  onClose,
}: {
  image: ImageLightboxTarget | null;
  onClose: () => void;
}) {
  const open = image !== null;
  const canOpenTab =
    Boolean(image?.src) &&
    (image!.src.startsWith("/") ||
      image!.src.startsWith("http://") ||
      image!.src.startsWith("https://"));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[min(92vh,920px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden border-0 bg-zinc-950 p-0 text-zinc-50 shadow-2xl sm:max-w-none",
          "ring-1 ring-white/10",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{image?.alt || "Image preview"}</DialogTitle>
        <DialogDescription className="sr-only">
          Full-size image. Escape or the close button dismisses the preview.
        </DialogDescription>

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
            {image?.alt || "Image"}
          </div>
          {canOpenTab && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-zinc-200 hover:bg-white/10 hover:text-white"
              asChild
            >
              <a href={image!.src} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                <span className="hidden sm:inline">New tab</span>
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 shrink-0 rounded-full bg-white text-zinc-900 shadow-md hover:bg-zinc-100"
            aria-label="Close preview"
            title="Close"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2.5} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-zinc-950">
          {image && (
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt}
                className="max-h-[min(80vh,820px)] max-w-full object-contain shadow-lg"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
