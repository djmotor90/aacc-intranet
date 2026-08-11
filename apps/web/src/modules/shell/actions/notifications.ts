/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, notificationPreferences, notifications, tasks, users } from "@aitim/db";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_TYPE_PREFS,
  normalizePrefsMap,
  type ChannelPrefs,
  type EmailDigest,
  type NotificationPrefsMap,
} from "@/lib/notification-prefs";
import type { NotificationType } from "@/lib/notify";
import { requireUser } from "@/lib/rbac";

export type InboxFilter = "unread" | "all";

export type InboxNotification = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorPhotoKey: string | null;
  taskId: string | null;
  taskNumber: string | null;
  taskTitle: string | null;
  /**
   * Comment/mention threads: true when someone else posted after the recipient
   * last opened the in-notification thread (or after the notification was created
   * if never opened). Drives the red envelope / “new in thread” badge.
   */
  threadHasNew?: boolean;
  /** Total replies under the thread root (not counting the root itself). */
  threadReplyCount?: number;
};

export type InboxResult = {
  items: InboxNotification[];
  unreadCount: number;
};

const NOTIF_TYPES = [
  "assigned",
  "mentioned",
  "comment",
  "status_changed",
  "due_soon",
  "form_submission",
] as const;

async function unreadCountFor(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        isNull(notifications.clearedAt),
      ),
    );
  return row?.n ?? 0;
}

function mapRows(
  rows: {
    id: string;
    type: string;
    payload: unknown;
    readAt: Date | null;
    createdAt: Date;
    threadViewedAt?: Date | null;
    actorId: string | null;
    actorName: string | null;
    actorPhotoKey: string | null;
    taskId: string | null;
    taskNumber: string | null;
    taskTitle: string | null;
  }[],
): InboxNotification[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: (r.payload ?? null) as Record<string, unknown> | null,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    actorId: r.actorId,
    actorName: r.actorName,
    actorPhotoKey: r.actorPhotoKey,
    taskId: r.taskId,
    taskNumber: r.taskNumber,
    taskTitle: r.taskTitle,
  }));
}

function threadRootFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.parentCommentId === "string" && p.parentCommentId) return p.parentCommentId;
  if (typeof p.commentId === "string" && p.commentId) return p.commentId;
  return null;
}

/**
 * Batch: for comment/mention notifications, detect replies from others after
 * the recipient last viewed the thread (or after the notif was created).
 */
async function enrichThreadActivity(
  userId: string,
  items: InboxNotification[],
  meta: { id: string; createdAt: Date; threadViewedAt: Date | null; type: string; payload: unknown }[],
): Promise<InboxNotification[]> {
  const byId = new Map(meta.map((m) => [m.id, m]));
  const rootIds = new Set<string>();
  for (const m of meta) {
    if (m.type !== "mentioned" && m.type !== "comment") continue;
    const root = threadRootFromPayload(m.payload);
    if (root) rootIds.add(root);
  }
  if (rootIds.size === 0) return items;

  const { comments } = await import("@aitim/db");
  const { inArray, isNull: isNullCol } = await import("drizzle-orm");
  const ids = [...rootIds];

  // All messages in these threads (root + replies).
  const rows = await db
    .select({
      id: comments.id,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      authorId: comments.authorId,
    })
    .from(comments)
    .where(
      and(
        isNullCol(comments.deletedAt),
        or(inArray(comments.id, ids), inArray(comments.parentCommentId, ids))!,
      ),
    );

  /** rootId → latest message from someone else */
  const latestOther = new Map<string, Date>();
  /** rootId → reply count (everyone) */
  const totalReplies = new Map<string, number>();

  for (const c of rows) {
    const rootKey =
      c.parentCommentId && rootIds.has(c.parentCommentId)
        ? c.parentCommentId
        : rootIds.has(c.id)
          ? c.id
          : null;
    if (!rootKey) continue;

    if (c.parentCommentId === rootKey) {
      totalReplies.set(rootKey, (totalReplies.get(rootKey) ?? 0) + 1);
    }
    if (c.authorId !== userId) {
      const prev = latestOther.get(rootKey);
      if (!prev || c.createdAt > prev) latestOther.set(rootKey, c.createdAt);
    }
  }

  return items.map((item) => {
    const m = byId.get(item.id);
    if (!m || (m.type !== "mentioned" && m.type !== "comment")) return item;
    const root = threadRootFromPayload(m.payload);
    if (!root) return item;
    // Never opened → baseline is notif createdAt (original mention is not "new").
    const viewed = m.threadViewedAt ?? m.createdAt;
    const latest = latestOther.get(root);
    const threadHasNew = Boolean(latest && latest.getTime() > viewed.getTime());
    return {
      ...item,
      threadHasNew,
      threadReplyCount: totalReplies.get(root) ?? 0,
    };
  });
}

/** Inbox feed for the header menu and full page. */
export async function getNotificationsInbox(params?: {
  filter?: InboxFilter;
  /** Single type or "all". */
  type?: string;
  search?: string;
  limit?: number;
}): Promise<InboxResult> {
  const user = await requireUser();
  const filter = params?.filter === "unread" ? "unread" : "all";
  const limit = Math.min(Math.max(params?.limit ?? 40, 1), 100);
  const type =
    params?.type && params.type !== "all" && (NOTIF_TYPES as readonly string[]).includes(params.type)
      ? params.type
      : null;
  const search = params?.search?.trim() ?? "";

  // Cleared notifications stay out of the inbox.
  const conditions = [
    eq(notifications.recipientId, user.id),
    isNull(notifications.clearedAt),
  ];
  if (filter === "unread") conditions.push(isNull(notifications.readAt));
  if (type) conditions.push(eq(notifications.type, type as NotificationType));
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      or(
        ilike(users.displayName, q),
        ilike(tasks.number, q),
        ilike(tasks.title, q),
        sql`coalesce(${notifications.payload}->>'preview','') ilike ${q}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      threadViewedAt: notifications.threadViewedAt,
      actorId: notifications.actorId,
      actorName: users.displayName,
      actorPhotoKey: users.photoKey,
      taskId: notifications.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const base = mapRows(rows);
  const items = await enrichThreadActivity(
    user.id,
    base,
    rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      threadViewedAt: r.threadViewedAt,
      type: r.type,
      payload: r.payload,
    })),
  );

  return {
    items,
    unreadCount: await unreadCountFor(user.id),
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireUser();
  return unreadCountFor(user.id);
}

/** Fetch one notification (for toast deep-link enrichment). */
export async function getNotificationById(id: string): Promise<InboxNotification | null> {
  const user = await requireUser();
  const nid = z.string().uuid().parse(id);
  const [r] = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      actorName: users.displayName,
      actorPhotoKey: users.photoKey,
      taskId: notifications.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .where(and(eq(notifications.id, nid), eq(notifications.recipientId, user.id)))
    .limit(1);
  if (!r) return null;
  return mapRows([r])[0] ?? null;
}

export async function markNotificationRead(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)));
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function markNotificationReadById(id: string): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  const nid = z.string().uuid().parse(id);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, nid), eq(notifications.recipientId, user.id)));
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: await unreadCountFor(user.id) };
}

export async function markNotificationUnreadById(id: string): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  const nid = z.string().uuid().parse(id);
  await db
    .update(notifications)
    .set({ readAt: null })
    .where(and(eq(notifications.id, nid), eq(notifications.recipientId, user.id)));
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: await unreadCountFor(user.id) };
}

export async function markAllNotificationsRead(): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, user.id),
        isNull(notifications.readAt),
        isNull(notifications.clearedAt),
      ),
    );
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: 0 };
}

/**
 * Mark the in-notification reply thread as viewed (clears “new messages” badge).
 * Also marks the notification as read.
 */
export async function markNotificationThreadViewed(
  id: string,
): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  const nid = z.string().uuid().parse(id);
  const now = new Date();
  await db
    .update(notifications)
    .set({
      threadViewedAt: now,
      readAt: now,
    })
    .where(
      and(
        eq(notifications.id, nid),
        eq(notifications.recipientId, user.id),
        isNull(notifications.clearedAt),
      ),
    );
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: await unreadCountFor(user.id) };
}

/** Dismiss one notification from the inbox (stays gone until never — soft clear). */
export async function clearNotificationById(id: string): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  const nid = z.string().uuid().parse(id);
  await db
    .update(notifications)
    .set({ clearedAt: new Date(), readAt: new Date() })
    .where(
      and(
        eq(notifications.id, nid),
        eq(notifications.recipientId, user.id),
        isNull(notifications.clearedAt),
      ),
    );
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: await unreadCountFor(user.id) };
}

/** Clear entire inbox (all non-cleared notifications for the current user). */
export async function clearAllNotifications(): Promise<{ unreadCount: number }> {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ clearedAt: new Date(), readAt: new Date() })
    .where(and(eq(notifications.recipientId, user.id), isNull(notifications.clearedAt)));
  revalidatePath("/notifications");
  revalidatePath("/");
  return { unreadCount: 0 };
}

/** Mentionable users for inbox quick-reply (list access for the task). */
export async function getMentionUsersForTask(
  taskId: string,
): Promise<{ id: string; displayName: string; photoKey: string | null }[]> {
  await requireUser();
  const tid = z.string().uuid().parse(taskId);
  const { tasks: tasksTable } = await import("@aitim/db");
  const [row] = await db
    .select({ listId: tasksTable.listId })
    .from(tasksTable)
    .where(eq(tasksTable.id, tid))
    .limit(1);
  if (!row) return [];
  const { getUsersWithListAccess } = await import("@/modules/tasks/queries");
  return getUsersWithListAccess(row.listId);
}

/** One message in a notification comment thread (root + replies). */
export type NotificationThreadMessage = {
  id: string;
  body: unknown;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorPhotoKey: string | null;
  parentCommentId: string | null;
  isMine: boolean;
};

export type NotificationThread = {
  rootCommentId: string;
  taskId: string;
  messages: NotificationThreadMessage[];
  currentUserId: string;
};

/**
 * Load the comment thread for inbox reply UI so conversation survives remounts
 * and page reloads (not just client-side "sentReplies" state).
 */
export async function getNotificationCommentThread(params: {
  taskId: string;
  /** Thread root (payload.parentCommentId or commentId). */
  rootCommentId: string;
}): Promise<NotificationThread | null> {
  const user = await requireUser();
  const taskId = z.string().uuid().parse(params.taskId);
  const rootCommentId = z.string().uuid().parse(params.rootCommentId);

  const { comments, tasks: tasksTable } = await import("@aitim/db");
  const [taskRow] = await db
    .select({ id: tasksTable.id, listId: tasksTable.listId })
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId))
    .limit(1);
  if (!taskRow) return null;

  // Must be able to see the list to read/reply in the thread.
  const { getListRole } = await import("@/lib/rbac");
  const role = await getListRole(user.id, taskRow.listId, user.platformRole);
  if (!role) return null;

  const [root] = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorId: comments.authorId,
      authorName: users.displayName,
      authorPhotoKey: users.photoKey,
      parentCommentId: comments.parentCommentId,
      taskId: comments.taskId,
      deletedAt: comments.deletedAt,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.id, rootCommentId), eq(comments.taskId, taskId)))
    .limit(1);

  if (!root || root.deletedAt) return null;

  // Flatten: replies hang off the root (Slack-style).
  const actualRootId = root.parentCommentId ?? root.id;

  const [actualRoot] =
    actualRootId === root.id
      ? [root]
      : await db
          .select({
            id: comments.id,
            body: comments.body,
            createdAt: comments.createdAt,
            authorId: comments.authorId,
            authorName: users.displayName,
            authorPhotoKey: users.photoKey,
            parentCommentId: comments.parentCommentId,
            taskId: comments.taskId,
            deletedAt: comments.deletedAt,
          })
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(and(eq(comments.id, actualRootId), eq(comments.taskId, taskId)))
          .limit(1);

  if (!actualRoot || actualRoot.deletedAt) return null;

  const replies = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorId: comments.authorId,
      authorName: users.displayName,
      authorPhotoKey: users.photoKey,
      parentCommentId: comments.parentCommentId,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(
      and(
        eq(comments.taskId, taskId),
        eq(comments.parentCommentId, actualRootId),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));

  const messages: NotificationThreadMessage[] = [
    {
      id: actualRoot.id,
      body: actualRoot.body,
      createdAt: actualRoot.createdAt.toISOString(),
      authorId: actualRoot.authorId,
      authorName: actualRoot.authorName,
      authorPhotoKey: actualRoot.authorPhotoKey,
      parentCommentId: actualRoot.parentCommentId,
      isMine: actualRoot.authorId === user.id,
    },
    ...replies.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      authorId: r.authorId,
      authorName: r.authorName,
      authorPhotoKey: r.authorPhotoKey,
      parentCommentId: r.parentCommentId,
      isMine: r.authorId === user.id,
    })),
  ];

  return {
    rootCommentId: actualRootId,
    taskId,
    messages,
    currentUserId: user.id,
  };
}

export type NotificationPrefsDto = {
  preferences: Record<NotificationType, ChannelPrefs>;
  emailDigest: EmailDigest;
};

export async function getNotificationPreferences(): Promise<NotificationPrefsDto> {
  const user = await requireUser();
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.id))
    .limit(1);
  return {
    preferences: normalizePrefsMap(row?.preferences),
    emailDigest: (row?.emailDigest as EmailDigest) ?? "instant",
  };
}

export async function saveNotificationPreferences(params: {
  preferences: NotificationPrefsMap;
  emailDigest: EmailDigest;
}): Promise<NotificationPrefsDto> {
  const user = await requireUser();
  const digest = z.enum(["instant", "hourly", "off"]).parse(params.emailDigest);

  const merged = { ...DEFAULT_TYPE_PREFS };
  for (const t of NOTIF_TYPES) {
    const p = params.preferences[t];
    const base = DEFAULT_TYPE_PREFS[t];
    merged[t] = {
      inApp: typeof p?.inApp === "boolean" ? p.inApp : base.inApp,
      email: typeof p?.email === "boolean" ? p.email : base.email,
    };
  }

  await db
    .insert(notificationPreferences)
    .values({
      userId: user.id,
      preferences: merged,
      emailDigest: digest,
    })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        preferences: merged,
        emailDigest: digest,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/notifications");
  return { preferences: merged, emailDigest: digest };
}
