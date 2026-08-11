/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import Link from "next/link";
import { History, Megaphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatWhatsNewDate,
  groupWhatsNewByDate,
  type WhatsNewEntry,
} from "@/content/whats-new";
import { cn } from "@/lib/utils";
import { WhatsNewKindBadge } from "./whats-new-kind-badge";

export function WhatsNewDialog({
  open,
  onOpenChange,
  unseenEntries,
  historyEntries,
  mode,
  onModeChange,
  onAcknowledge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Updates newer than the viewer's acknowledged cursor. */
  unseenEntries: WhatsNewEntry[];
  /** Complete curated product history visible to this viewer. */
  historyEntries: WhatsNewEntry[];
  /** "unseen" = "New since your last visit"; "history" = full feed. */
  mode: "unseen" | "history";
  onModeChange: (mode: "unseen" | "history") => void;
  onAcknowledge: () => void;
}) {
  const entries = mode === "unseen" ? unseenEntries : historyEntries;
  const groups = groupWhatsNewByDate(entries);
  const empty = entries.length === 0;

  function handleFooterAction() {
    if (mode === "unseen") onAcknowledge();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "flex max-h-[min(88vh,46rem)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
        )}
      >
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">
              What&apos;s New
            </DialogTitle>
            <DialogDescription className="sr-only">
              Browse new product updates or the complete AACC Hub product history.
            </DialogDescription>
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-b bg-muted/20 px-5 py-2.5" role="tablist" aria-label="What's New views">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "unseen"}
            onClick={() => onModeChange("unseen")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              mode === "unseen"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5" aria-hidden />
            New
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
              mode === "unseen" ? "bg-primary-foreground/20" : "bg-muted",
            )}>
              {unseenEntries.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "history"}
            onClick={() => onModeChange("history")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              mode === "history"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <History className="size-3.5" aria-hidden />
            Full history
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
              mode === "history" ? "bg-primary-foreground/20" : "bg-muted",
            )}>
              {historyEntries.length}
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {empty ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Megaphone className="size-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                New features, fixes, and improvements will show up here after each
                update.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {mode === "unseen" ? "New since your last visit" : "Complete product history"}
              </p>
              {groups.map((group) => (
                <section key={group.date} className="relative pl-4">
                  <div
                    className="absolute bottom-0 left-0 top-1 w-0.5 rounded-full bg-primary/40"
                    aria-hidden
                  />
                  <h3 className="mb-3 text-sm font-medium text-foreground">
                    {formatWhatsNewDate(group.date)}
                  </h3>
                  <ul className="flex flex-col gap-4">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="flex gap-3">
                        <WhatsNewKindBadge kind={entry.kind} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          {entry.href ? (
                            <Link
                              href={entry.href}
                              onClick={() => onOpenChange(false)}
                              className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {entry.title}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold text-foreground">
                              {entry.title}
                            </p>
                          )}
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {entry.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {mode === "history"
              ? `${historyEntries.length} update${historyEntries.length === 1 ? "" : "s"}`
              : `${unseenEntries.length} unread update${unseenEntries.length === 1 ? "" : "s"}`}
          </span>
          <Button
            type="button"
            variant="outline"
            className="rounded-full px-5"
            onClick={handleFooterAction}
          >
            {mode === "unseen" ? "Got it" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
