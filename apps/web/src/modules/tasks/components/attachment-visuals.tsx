"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mime: string, name: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/i.test(name);
}

/** Google Drive–style colored type icon for a file. */
export function FileTypeVisual({
  mimeType,
  fileName,
  attachmentId,
  size = "lg",
}: {
  mimeType: string;
  fileName: string;
  attachmentId: string;
  size?: "sm" | "lg";
}) {
  const iconClass = size === "lg" ? "size-10" : "size-4";
  const boxClass =
    size === "lg"
      ? "flex size-16 items-center justify-center rounded-xl"
      : "flex size-8 items-center justify-center rounded-md";

  if (isImageAttachment(mimeType, fileName)) {
    if (size === "lg") {
      return (
        <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/attachments/${attachmentId}`}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = "none";
              const fallback = (event.target as HTMLImageElement).nextElementSibling;
              if (fallback instanceof HTMLElement) fallback.classList.remove("hidden");
            }}
          />
          <div
            className={cn(
              boxClass,
              "absolute inset-0 hidden bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
            )}
          >
            <FileImage className={iconClass} />
          </div>
        </div>
      );
    }
    return (
      <span className={cn(boxClass, "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300")}>
        <FileImage className={iconClass} />
      </span>
    );
  }

  const lower = fileName.toLowerCase();
  let Icon = FileIcon;
  let tone = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    Icon = FileText;
    tone = "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300";
  } else if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    /\.(xlsx?|csv|ods)$/i.test(lower)
  ) {
    Icon = FileSpreadsheet;
    tone = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  } else if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    /\.(pptx?|key|odp)$/i.test(lower)
  ) {
    Icon = Presentation;
    tone = "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300";
  } else if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    /\.(docx?|rtf|odt|txt|md)$/i.test(lower)
  ) {
    Icon = FileText;
    tone = "bg-brand-aqua/70 text-brand-teal-deep dark:bg-primary/20 dark:text-primary";
  } else if (mimeType.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(lower)) {
    Icon = FileVideo;
    tone = "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300";
  } else if (mimeType.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(lower)) {
    Icon = FileAudio;
    tone = "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300";
  } else if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(lower)
  ) {
    Icon = FileArchive;
    tone = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  } else if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    /\.(js|ts|tsx|jsx|py|go|rs|java|css|html|json|yml|yaml|sh)$/i.test(lower)
  ) {
    Icon = FileCode;
    tone = "bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20";
  }

  return (
    <span className={cn(boxClass, tone)}>
      <Icon className={iconClass} strokeWidth={1.5} />
    </span>
  );
}

export function FolderVisual({ size = "lg" }: { size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="flex size-20 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
        <Folder
          className="size-12 fill-amber-400 text-amber-500 dark:fill-amber-500/80 dark:text-amber-400"
          strokeWidth={1}
        />
      </span>
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-950/40">
      <Folder className="size-4 fill-amber-400 text-amber-500" strokeWidth={1.25} />
    </span>
  );
}
