/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * User photo via `/api/avatar/:id`.
 *
 * Initials always sit underneath. The `<img>` is fully opaque as soon as it is
 * in the DOM (no opacity-0 / onLoad race — cached images were stuck invisible
 * when `load` fired before React bound the handler).
 */
export function UserAvatar({
  userId,
  name,
  hasPhoto,
  /** Cache-bust after upload (e.g. photoKey or updated timestamp). */
  photoVersion,
  className,
  /** Prefer high priority for header / self avatar. */
  priority = false,
}: {
  userId: string;
  name: string;
  hasPhoto?: boolean;
  photoVersion?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const src =
    hasPhoto === false
      ? undefined
      : photoVersion
        ? `/api/avatar/${userId}?v=${encodeURIComponent(photoVersion.slice(-24))}`
        : `/api/avatar/${userId}`;

  const [failed, setFailed] = useState(false);
  // Reset error when the source identity changes.
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setFailed(false);
  }

  const showImage = Boolean(src && !failed);

  return (
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 select-none overflow-hidden rounded-full",
        "bg-muted text-muted-foreground after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
        className,
      )}
      title={name}
    >
      <span className="flex size-full items-center justify-center text-xs font-medium">
        {initials(name)}
      </span>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated API URL
        <img
          key={src}
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
