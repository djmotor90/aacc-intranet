"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  getPublicUserProfile,
  type PublicUserProfile,
} from "@/modules/shell/actions/public-profile";

type TabId = "activity" | "tasks" | "comments";

function formatLocalClock(): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return "";
  }
}

function formatActivityTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function UserProfileSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("activity");
  const [clock, setClock] = useState(formatLocalClock);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setClock(formatLocalClock()), 30_000);
    return () => clearInterval(t);
  }, [open]);

  // Reset local state when the sheet closes (or the target user is cleared) —
  // adjust-state-during-render instead of an effect.
  const [prevTarget, setPrevTarget] = useState({ open, userId });
  if (prevTarget.open !== open || prevTarget.userId !== userId) {
    setPrevTarget({ open, userId });
    if (!open || !userId) {
      setProfile(null);
      setError(null);
      setTab("activity");
    }
  }

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await getPublicUserProfile(userId);
        if (!cancelled) setProfile(p);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>User profile</SheetTitle>
          <SheetDescription>Public intranet profile</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Loading profile…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
            {error}
          </div>
        )}
        {profile && !loading && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="border-b bg-muted/30 px-5 pb-4 pt-6">
              <div className="flex items-start gap-3">
                <UserAvatar
                  userId={profile.id}
                  name={profile.displayName}
                  hasPhoto={profile.hasPhoto}
                  photoVersion={profile.photoKey}
                  className="size-16 text-lg"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold leading-tight">
                    {profile.displayName}
                  </h2>
                  {(profile.jobTitle || profile.department) && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {[profile.jobTitle, profile.department].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        profile.presence === "online"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          profile.presence === "online" ? "bg-emerald-500" : "bg-muted-foreground/50",
                        )}
                      />
                      {profile.presence === "online" ? "Online" : "Offline"}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {profile.roleLabel}
                    </Badge>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {profile.email}
                {clock ? ` · ${clock} local time` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{profile.lastSeenLabel}</p>
            </div>

            {/* Counts / tabs */}
            <div className="flex border-b px-2">
              {(
                [
                  { id: "activity" as const, label: "Activity", n: profile.counts.activity24h },
                  { id: "tasks" as const, label: "Tasks", n: profile.counts.tasks },
                  { id: "comments" as const, label: "Comments", n: profile.counts.comments },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 border-b-2 px-2 py-2.5 text-center text-xs font-medium transition-colors",
                    tab === t.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span className="ml-1 tabular-nums text-muted-foreground">({t.n})</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === "activity" && (
                <div className="flex flex-col gap-6">
                  {/* Focused on */}
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Focused on
                    </h3>
                    <p className="mb-3 text-[11px] text-muted-foreground">In the last 24 hours</p>
                    {profile.focusedTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent task focus yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-2.5">
                        {profile.focusedTasks.map((t) => (
                          <li key={t.taskId}>
                            <Link
                              href={`/tasks/task/${t.number}`}
                              onClick={() => onOpenChange(false)}
                              className="group flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium group-hover:underline">
                                  <span className="text-muted-foreground">{t.number}</span>{" "}
                                  {t.title}
                                </div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {t.spaceName} / {t.listName}
                                  {t.statusName ? ` · ${t.statusName}` : ""}
                                </div>
                              </div>
                              {t.percent > 0 && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                  {t.percent}%
                                </span>
                              )}
                            </Link>
                            {t.percent > 0 && (
                              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary/70"
                                  style={{ width: `${Math.min(100, t.percent)}%` }}
                                />
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Activity feed */}
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Activity
                    </h3>
                    {profile.recentActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {profile.recentActivity.map((a) => (
                          <li key={a.id} className="flex gap-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <p>
                                <span className="font-medium">{profile.displayName}</span>{" "}
                                <span className="text-muted-foreground">{a.summary}</span>
                              </p>
                              {a.taskNumber && (
                                <Link
                                  href={`/tasks/task/${a.taskNumber}`}
                                  onClick={() => onOpenChange(false)}
                                  className="mt-0.5 block truncate text-xs text-primary hover:underline"
                                >
                                  {a.taskNumber}
                                  {a.taskTitle ? ` · ${a.taskTitle}` : ""}
                                </Link>
                              )}
                              {a.spaceName && (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {a.spaceName}
                                  {a.listSlug ? ` / ${a.listSlug}` : ""}
                                </p>
                              )}
                            </div>
                            <time className="shrink-0 text-[11px] text-muted-foreground">
                              {formatActivityTime(a.createdAt)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}

              {tab === "tasks" && (
                <div className="flex flex-col gap-2">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Open tasks assigned to {profile.displayName.split(" ")[0]} (
                    {profile.counts.tasks})
                  </p>
                  {profile.focusedTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open assigned tasks.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {profile.focusedTasks.map((t) => (
                        <li key={`task-${t.taskId}`}>
                          <Link
                            href={`/tasks/task/${t.number}`}
                            onClick={() => onOpenChange(false)}
                            className="block rounded-md border px-3 py-2 hover:bg-muted/50"
                          >
                            <div className="truncate text-sm font-medium">
                              <span className="text-muted-foreground">{t.number}</span> {t.title}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {t.spaceName} / {t.listName}
                              {t.statusName ? ` · ${t.statusName}` : ""}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {profile.counts.tasks > profile.focusedTasks.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing recent tasks · {profile.counts.tasks} total assigned
                    </p>
                  )}
                </div>
              )}

              {tab === "comments" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {profile.counts.comments === 0
                      ? "No comments yet."
                      : `${profile.counts.comments} comment${profile.counts.comments === 1 ? "" : "s"} across tasks.`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Comment bodies open on each task. Recent comment activity appears under Activity.
                  </p>
                  {profile.recentActivity
                    .filter((a) => a.verb.startsWith("comment."))
                    .slice(0, 15)
                    .map((a) => (
                      <div key={`c-${a.id}`} className="rounded-md border px-3 py-2 text-sm">
                        <p className="text-muted-foreground">{a.summary}</p>
                        {a.taskNumber && (
                          <Link
                            href={`/tasks/task/${a.taskNumber}`}
                            onClick={() => onOpenChange(false)}
                            className="mt-1 block text-xs text-primary hover:underline"
                          >
                            {a.taskNumber}
                            {a.taskTitle ? ` · ${a.taskTitle}` : ""}
                          </Link>
                        )}
                        <time className="mt-1 block text-[11px] text-muted-foreground">
                          {formatActivityTime(a.createdAt)}
                        </time>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="border-t p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
