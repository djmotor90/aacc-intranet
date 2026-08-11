/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { Megaphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  computeAcknowledgeCursor,
  listUnseenWhatsNewEntries,
  listWhatsNewEntries,
  type WhatsNewEntry,
} from "@/content/whats-new";
import {
  acknowledgeWhatsNew,
  loadWhatsNewSeenState,
  type WhatsNewSeenState,
} from "@/lib/whats-new-storage";
import { cn } from "@/lib/utils";
import { WhatsNewDialog } from "./whats-new-dialog";

/** Session key: only auto-open once per browser tab session after hydration. */
const AUTO_OPEN_SESSION_KEY = "aitim:whats-new:auto-opened";

export function WhatsNewButton({ isAdmin = false }: { isAdmin?: boolean }) {
  const allEntries = useMemo(
    () => listWhatsNewEntries({ isAdmin }),
    [isAdmin],
  );

  const [seen, setSeen] = useState<WhatsNewSeenState | null>(null);
  const [open, setOpen] = useState(false);
  /** When opening from the badge/auto, show unseen; gear/history can show all. */
  const [mode, setMode] = useState<"unseen" | "history">("unseen");

  // Hydrate seen-state after mount (localStorage).
  useEffect(() => {
    queueMicrotask(() => {
      setSeen(loadWhatsNewSeenState());
    });
  }, []);

  const unseen = useMemo(() => {
    if (!seen) return [] as WhatsNewEntry[];
    return listUnseenWhatsNewEntries(allEntries, seen.acknowledgedThrough);
  }, [allEntries, seen]);

  const unseenCount = unseen.length;

  // Auto-open once when there are unseen entries (product "what's new" moment).
  useEffect(() => {
    if (!seen) return;
    if (unseenCount === 0) return;
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(AUTO_OPEN_SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(AUTO_OPEN_SESSION_KEY, "1");
    } catch {
      // sessionStorage blocked — still open once this mount.
    }
    // Defer out of the effect body (same pattern as AppShell localStorage hydrate).
    queueMicrotask(() => {
      setMode("unseen");
      setOpen(true);
    });
  }, [seen, unseenCount]);

  const onAcknowledge = useCallback(() => {
    // Acknowledge through the newest visible entry so history stays available.
    const cursor =
      computeAcknowledgeCursor(allEntries) ??
      computeAcknowledgeCursor(unseen) ??
      new Date().toISOString();
    const next = acknowledgeWhatsNew(cursor);
    setSeen(next);
  }, [allEntries, unseen]);

  function openDialog(nextMode: "unseen" | "history") {
    setMode(nextMode);
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "relative size-9 rounded-full",
          unseenCount > 0 && "text-primary",
        )}
        aria-label={
          unseenCount > 0
            ? `What's new, ${unseenCount} unread update${unseenCount === 1 ? "" : "s"}`
            : "What's new"
        }
        title="What's new"
        onClick={() => openDialog(unseenCount > 0 ? "unseen" : "history")}
      >
        <Megaphone className="size-4" />
        {unseenCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            aria-hidden
          >
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </Button>

      <WhatsNewDialog
        open={open}
        onOpenChange={setOpen}
        unseenEntries={unseen}
        historyEntries={allEntries}
        mode={mode}
        onModeChange={setMode}
        onAcknowledge={onAcknowledge}
      />
    </>
  );
}
