"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Bell, CheckCheck, Loader2, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { NotificationPreferencesPanel } from "@/components/shell/notification-preferences-panel";
import { NotificationRow } from "@/components/shell/notification-row";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TIME_BUCKET_LABELS,
  groupHeadline,
  groupInboxItems,
  notificationHeadline,
  notificationTimeBucket,
  type TimeBucket,
} from "@/lib/notification-copy";
import { cn } from "@/lib/utils";
import {
  clearAllNotifications,
  clearNotificationById,
  getNotificationById,
  getNotificationsInbox,
  markAllNotificationsRead,
  markNotificationReadById,
  markNotificationUnreadById,
  type InboxFilter,
  type InboxNotification,
} from "@/modules/shell/actions/notifications";

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"inbox" | "settings">("inbox");
  // Default "all" so reply threads stay visible after mark-as-read (Clear removes them).
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (f: InboxFilter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getNotificationsInbox({ filter: f, limit: 50 });
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCount = useCallback(() => {
    fetch("/api/notifications/count")
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const es = new EventSource("/api/sse");
    es.addEventListener("notification", (ev) => {
      refreshCount();
      if (open && view === "inbox") void load(filter);

      // Soft toast for high-priority types when menu is closed
      if (open) return;
      try {
        const data = JSON.parse((ev as MessageEvent).data || "{}") as {
          toast?: boolean;
          type?: string;
          notificationId?: string;
        };
        if (!data.toast || !data.notificationId) return;
        void (async () => {
          try {
            const n = await getNotificationById(data.notificationId!);
            if (!n) return;
            const title = notificationHeadline({
              type: n.type,
              actorName: n.actorName,
              payload: n.payload,
            });
            const desc = n.taskNumber
              ? `${n.taskNumber}${n.taskTitle ? ` · ${n.taskTitle}` : ""}`
              : undefined;
            toast(title, {
              description: desc,
              action: n.taskNumber
                ? {
                    label: "Open",
                    onClick: () => router.push(`/tasks/task/${n.taskNumber}`),
                  }
                : undefined,
            });
          } catch {
            // ignore toast failures
          }
        })();
      } catch {
        // ignore parse errors
      }
    });
    return () => es.close();
  }, [refreshCount, open, filter, load, view, router]);

  useEffect(() => {
    if (open && view === "inbox") {
      void (async () => {
        await load(filter);
      })();
    }
  }, [open, filter, load, view]);

  // Reset to the inbox view whenever the popover closes (adjust-state-during-render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setView("inbox");
  }

  const sections = useMemo(() => {
    const order: TimeBucket[] = ["today", "yesterday", "earlier"];
    const map = new Map<TimeBucket, InboxNotification[]>();
    for (const b of order) map.set(b, []);
    for (const item of items) {
      map.get(notificationTimeBucket(item.createdAt))!.push(item);
    }
    return order
      .map((b) => ({
        bucket: b,
        groups: groupInboxItems(map.get(b)!),
      }))
      .filter((s) => s.groups.length > 0);
  }, [items]);

  function onOpenItem(item: InboxNotification) {
    startTransition(async () => {
      try {
        if (!item.readAt) {
          const r = await markNotificationReadById(item.id);
          setUnreadCount(r.unreadCount);
          setItems((cur) =>
            cur.map((n) =>
              n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
            ),
          );
        }
        if (item.taskNumber) {
          setOpen(false);
          router.push(`/tasks/task/${item.taskNumber}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open notification");
      }
    });
  }

  function onToggleRead(item: InboxNotification) {
    startTransition(async () => {
      try {
        if (item.readAt) {
          const r = await markNotificationUnreadById(item.id);
          setUnreadCount(r.unreadCount);
          setItems((cur) =>
            cur.map((n) => (n.id === item.id ? { ...n, readAt: null } : n)),
          );
        } else {
          const r = await markNotificationReadById(item.id);
          setUnreadCount(r.unreadCount);
          setItems((cur) => {
            const next = cur.map((n) =>
              n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
            );
            return filter === "unread" ? next.filter((n) => !n.readAt) : next;
          });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  function onMarkAll() {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        setUnreadCount(0);
        if (filter === "unread") setItems([]);
        else {
          setItems((cur) =>
            cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
          );
        }
        toast.success("All caught up");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not mark all read");
      }
    });
  }

  function onClearItem(item: InboxNotification) {
    startTransition(async () => {
      try {
        const r = await clearNotificationById(item.id);
        setUnreadCount(r.unreadCount);
        setItems((cur) => cur.filter((n) => n.id !== item.id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear");
      }
    });
  }

  function onClearAll() {
    startTransition(async () => {
      try {
        await clearAllNotifications();
        setUnreadCount(0);
        setItems([]);
        toast.success("Inbox cleared");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear all");
      }
    });
  }

  function markGroupRead(groupItems: InboxNotification[]) {
    startTransition(async () => {
      try {
        let lastCount = unreadCount;
        for (const item of groupItems) {
          if (!item.readAt) {
            const r = await markNotificationReadById(item.id);
            lastCount = r.unreadCount;
          }
        }
        setUnreadCount(lastCount);
        const ids = new Set(groupItems.map((i) => i.id));
        setItems((cur) => {
          const next = cur.map((n) =>
            ids.has(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
          );
          return filter === "unread" ? next.filter((n) => !n.readAt) : next;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-9 rounded-full"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        role="dialog"
        aria-label="Notifications"
        className="flex w-[min(100vw-1.5rem,24rem)] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">
            {view === "settings" ? "Preferences" : "Notifications"}
          </h2>
          <div className="flex items-center gap-0.5">
            {view === "inbox" && unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={pending}
                onClick={onMarkAll}
                title="Mark all as read (keeps them in All)"
              >
                <CheckCheck className="size-3.5" />
                Mark all
              </Button>
            )}
            {view === "inbox" && items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={pending}
                onClick={onClearAll}
                title="Clear all notifications from the inbox"
              >
                <Trash2 className="size-3.5" />
                Clear all
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={view === "settings" ? "Back to inbox" : "Notification preferences"}
              onClick={() => setView((v) => (v === "inbox" ? "settings" : "inbox"))}
            >
              <Settings2 className={cn("size-3.5", view === "settings" && "text-primary")} />
            </Button>
          </div>
        </div>

        {view === "settings" ? (
          <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
            <NotificationPreferencesPanel onSaved={() => setView("inbox")} />
          </div>
        ) : (
          <>
            <div className="flex gap-1 border-b px-3 py-2">
              {(["unread", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f === "unread" ? (
                    <>
                      Unread
                      {unreadCount > 0 && (
                        <span className="ml-1 tabular-nums opacity-90">{unreadCount}</span>
                      )}
                    </>
                  ) : (
                    "All"
                  )}
                </button>
              ))}
            </div>

            <div className="max-h-[min(70vh,28rem)] min-h-[12rem] overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <p className="text-sm text-destructive">{loadError}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void load(filter)}>
                    Retry
                  </Button>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                  <Bell className="mb-1 size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">
                    {filter === "unread" ? "You’re all caught up" : "No notifications yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {filter === "unread"
                      ? "New assignments, mentions, and due dates will show up here."
                      : "When teammates assign or mention you, it will appear here."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 px-1.5 py-2">
                  {sections.map(({ bucket, groups }) => (
                    <section key={bucket}>
                      <h3 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {TIME_BUCKET_LABELS[bucket]}
                      </h3>
                      <ul className="flex flex-col gap-0.5">
                        {groups.map((g) =>
                          g.kind === "single" ? (
                            <li key={g.item.id}>
                              <NotificationRow
                                item={g.item}
                                compact
                                onOpen={onOpenItem}
                                onToggleRead={onToggleRead}
                                onClear={onClearItem}
                                onThreadViewed={(item) => {
                                  setItems((cur) =>
                                    cur.map((n) =>
                                      n.id === item.id
                                        ? {
                                            ...n,
                                            readAt: n.readAt ?? new Date().toISOString(),
                                            threadHasNew: false,
                                          }
                                        : n,
                                    ),
                                  );
                                  void getNotificationsInbox({ filter, limit: 50 }).then((d) =>
                                    setUnreadCount(d.unreadCount),
                                  );
                                }}
                                onReplySent={(item) => {
                                  // Mark read but keep in the list (Clear is what removes it).
                                  if (item.readAt) return;
                                  void markNotificationReadById(item.id).then((r) => {
                                    setUnreadCount(r.unreadCount);
                                    setItems((cur) =>
                                      cur.map((n) =>
                                        n.id === item.id
                                          ? { ...n, readAt: new Date().toISOString() }
                                          : n,
                                      ),
                                    );
                                  });
                                }}
                              />
                            </li>
                          ) : (
                            <li key={g.id}>
                              <GroupedNotificationCard
                                count={g.count}
                                latest={g.latest}
                                items={g.items}
                                onOpen={() => onOpenItem(g.latest)}
                                onMarkRead={() => markGroupRead(g.items)}
                              />
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t px-2 py-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-md py-2 text-xs font-medium text-primary hover:bg-muted"
              >
                See all notifications
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function GroupedNotificationCard({
  count,
  latest,
  items,
  onOpen,
  onMarkRead,
}: {
  count: number;
  latest: InboxNotification;
  items: InboxNotification[];
  onOpen: () => void;
  onMarkRead: () => void;
}) {
  const unread = items.some((i) => !i.readAt);
  const title = groupHeadline({
    type: latest.type,
    actorName: latest.actorName,
    count,
    taskNumber: latest.taskNumber,
  });

  return (
    <div
      className={cn(
        "group/nrow flex w-full items-start gap-1 rounded-lg transition-colors",
        unread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative shrink-0">
          {latest.actorId ? (
            <UserAvatar
              userId={latest.actorId}
              name={latest.actorName ?? "Someone"}
              hasPhoto={!!latest.actorPhotoKey}
              photoVersion={latest.actorPhotoKey}
              className="size-8"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {count}
            </div>
          )}
          {unread && (
            <span className="absolute -left-0.5 top-0 size-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm leading-snug", unread && "font-medium")}>{title}</p>
          {latest.taskTitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{latest.taskTitle}</p>
          )}
        </div>
      </button>
      <button
        type="button"
        className="mt-1.5 shrink-0 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/nrow:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onMarkRead();
        }}
      >
        Mark read
      </button>
    </div>
  );
}
