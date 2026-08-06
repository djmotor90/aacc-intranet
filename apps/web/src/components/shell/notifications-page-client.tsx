"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { CheckCheck, Search, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { NotificationPreferencesPanel } from "@/components/shell/notification-preferences-panel";
import { NotificationRow } from "@/components/shell/notification-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  NOTIFICATION_TYPE_FILTERS,
  TIME_BUCKET_LABELS,
  groupHeadline,
  groupInboxItems,
  notificationTimeBucket,
  type TimeBucket,
} from "@/lib/notification-copy";
import { cn } from "@/lib/utils";
import {
  clearAllNotifications,
  clearNotificationById,
  getNotificationsInbox,
  markAllNotificationsRead,
  markNotificationReadById,
  markNotificationUnreadById,
  type InboxFilter,
  type InboxNotification,
  type InboxResult,
} from "@/modules/shell/actions/notifications";

export function NotificationsPageClient({ initial }: { initial: InboxResult }) {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(initial.items);
  const [unreadCount, setUnreadCount] = useState(initial.unreadCount);
  const [pending, startTransition] = useTransition();
  const [prefsOpen, setPrefsOpen] = useState(false);

  const reload = useCallback(
    (opts?: { filter?: InboxFilter; type?: string; search?: string }) => {
      const f = opts?.filter ?? filter;
      const t = opts?.type ?? typeFilter;
      const q = opts?.search ?? search;
      startTransition(async () => {
        try {
          const data = await getNotificationsInbox({
            filter: f,
            type: t,
            search: q || undefined,
            limit: 100,
          });
          setItems(data.items);
          setUnreadCount(data.unreadCount);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to load");
        }
      });
    },
    [filter, typeFilter, search],
  );

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

  function onOpen(item: InboxNotification) {
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
        if (item.taskNumber) router.push(`/tasks/task/${item.taskNumber}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open");
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
          setItems((cur) =>
            cur.map((n) =>
              n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
            ),
          );
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
        setItems((cur) =>
          cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Notifications
            {unreadCount > 0 && (
              <Badge variant="default" className="align-middle text-xs">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assignments, mentions, comments, and due dates in one place. Reply in
            threads here — Clear removes a notification from the inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setPrefsOpen(true)}
          >
            <Settings2 className="size-3.5" />
            Preferences
          </Button>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={onMarkAll}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
          {items.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={onClearAll}
            >
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") reload({ search });
            }}
            placeholder="Search people, tasks…"
            className="h-9 pl-8"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={pending}
          onClick={() => reload()}
        >
          Search
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {(["unread", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
              reload({ filter: f });
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f === "unread" ? `Unread${unreadCount ? ` (${unreadCount})` : ""}` : "All"}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {NOTIFICATION_TYPE_FILTERS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setTypeFilter(t.value);
              reload({ type: t.value });
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              typeFilter === t.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          {filter === "unread"
            ? "You’re all caught up — no unread notifications."
            : search || typeFilter !== "all"
              ? "No notifications match your filters."
              : "No notifications yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map(({ bucket, groups }) => (
            <section key={bucket}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {TIME_BUCKET_LABELS[bucket]}
              </h2>
              <ul className="flex flex-col gap-1 rounded-xl border bg-card p-1.5">
                {groups.map((g) =>
                  g.kind === "single" ? (
                    <li key={g.item.id}>
                      <NotificationRow
                        item={g.item}
                        onOpen={onOpen}
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
                          setUnreadCount((c) => (item.readAt ? c : Math.max(0, c - 1)));
                        }}
                        onReplySent={(item) => {
                          // Mark read but keep in inbox until Clear.
                          if (!item.readAt) onToggleRead(item);
                        }}
                      />
                    </li>
                  ) : (
                    <li key={g.id} className="rounded-lg border border-dashed border-border/60">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40"
                        onClick={() => onOpen(g.latest)}
                      >
                        {groupHeadline({
                          type: g.type,
                          actorName: g.latest.actorName,
                          count: g.count,
                          taskNumber: g.latest.taskNumber,
                        })}
                        <span className="ml-1 font-normal">· open latest</span>
                      </button>
                      <NotificationRow
                        item={g.latest}
                        onOpen={onOpen}
                        onToggleRead={() => {
                          startTransition(async () => {
                            for (const item of g.items) {
                              if (!item.readAt) await markNotificationReadById(item.id);
                            }
                            reload();
                          });
                        }}
                      />
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={prefsOpen} onOpenChange={setPrefsOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Notification preferences</SheetTitle>
            <SheetDescription>Control inbox and email for each event type.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto">
            <NotificationPreferencesPanel onSaved={() => setPrefsOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
