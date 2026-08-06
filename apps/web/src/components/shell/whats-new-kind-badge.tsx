/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { cn } from "@/lib/utils";
import {
  WHATS_NEW_KIND_LABEL,
  type WhatsNewKind,
} from "@/content/whats-new";

const KIND_CLASS: Record<WhatsNewKind, string> = {
  new: "bg-violet-600 text-white dark:bg-violet-500",
  fixed: "bg-emerald-700 text-white dark:bg-emerald-600",
  improved: "bg-teal-600 text-white dark:bg-teal-500",
};

export function WhatsNewKindBadge({
  kind,
  className,
}: {
  kind: WhatsNewKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold tracking-wide",
        KIND_CLASS[kind],
        className,
      )}
    >
      {WHATS_NEW_KIND_LABEL[kind]}
    </span>
  );
}
