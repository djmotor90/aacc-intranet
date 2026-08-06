/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, notificationPreferences, notifications } from "@aitim/db";
import { inArray, sql } from "drizzle-orm";
import { enqueue } from "./queue";
import { resolveTypePrefs } from "./notification-prefs";

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "comment"
  | "status_changed"
  | "due_soon"
  | "form_submission";

export interface NotifyInput {
  recipientIds: string[];
  type: NotificationType;
  taskId?: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Fan out a notification: insert rows (respecting in-app prefs), ping SSE,
 * and enqueue email delivery. Call after the triggering transaction commits.
 *
 * By default the actor is not notified about their own action (e.g. you won't
 * get a "comment" notice for a comment you wrote). Exception: type `mentioned`
 * keeps explicit self-@mentions so @yourself still lands in the inbox.
 */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.recipientIds)].filter((id) => {
    if (id !== input.actorId) return true;
    // Explicit @self — still notify (common when testing, and intentional).
    return input.type === "mentioned";
  });
  if (recipients.length === 0) return;

  // Load prefs for all recipients in one query
  const prefRows =
    recipients.length > 0
      ? await db
          .select()
          .from(notificationPreferences)
          .where(inArray(notificationPreferences.userId, recipients))
      : [];
  const prefsByUser = new Map(prefRows.map((p) => [p.userId, p]));

  const inAppRecipients = recipients.filter((id) => {
    const prefs = prefsByUser.get(id);
    const channel = resolveTypePrefs(prefs?.preferences, input.type);
    return channel.inApp;
  });

  function digestFor(userId: string): "instant" | "hourly" | "off" {
    const prefs = prefsByUser.get(userId);
    return (prefs?.emailDigest as "instant" | "hourly" | "off" | undefined) ?? "instant";
  }

  function wantsEmail(userId: string): boolean {
    const prefs = prefsByUser.get(userId);
    const channel = resolveTypePrefs(prefs?.preferences, input.type);
    if (!channel.email) return false;
    const digest = digestFor(userId);
    return digest !== "off";
  }

  /** Instant SMTP only — hourly is picked up by the digest worker. */
  function wantsInstantEmail(userId: string): boolean {
    return wantsEmail(userId) && digestFor(userId) === "instant";
  }

  // Email-only recipients (in-app off): still store a row so digests / instant email work.
  const emailOnly = recipients.filter((id) => {
    if (inAppRecipients.includes(id)) return false;
    return wantsEmail(id);
  });

  if (inAppRecipients.length === 0 && emailOnly.length === 0) return;

  type Inserted = { id: string; recipientId: string };

  let rows: Inserted[] = [];
  if (inAppRecipients.length > 0) {
    rows = await db
      .insert(notifications)
      .values(
        inAppRecipients.map((recipientId) => ({
          recipientId,
          type: input.type,
          taskId: input.taskId,
          actorId: input.actorId ?? null,
          payload: input.payload,
        })),
      )
      .returning({
        id: notifications.id,
        recipientId: notifications.recipientId,
      });
  }

  if (emailOnly.length > 0) {
    const extra = await db
      .insert(notifications)
      .values(
        emailOnly.map((recipientId) => ({
          recipientId,
          type: input.type,
          taskId: input.taskId,
          actorId: input.actorId ?? null,
          payload: input.payload,
          readAt: new Date(), // no unread badge
        })),
      )
      .returning({ id: notifications.id, recipientId: notifications.recipientId });
    rows = [...rows, ...extra];
  }

  for (const row of rows) {
    const prefs = prefsByUser.get(row.recipientId);
    const channel = resolveTypePrefs(prefs?.preferences, input.type);
    const inApp = channel.inApp && inAppRecipients.includes(row.recipientId);
    const toast = inApp && ["assigned", "mentioned", "due_soon"].includes(input.type);

    if (inApp) {
      await db.execute(
        sql`select pg_notify('app_events', ${JSON.stringify({
          kind: "notification",
          recipientId: row.recipientId,
          notificationId: row.id,
          type: input.type,
          taskId: input.taskId ?? null,
          toast,
          payload: input.payload ?? null,
        })})`,
      );
    }

    // Instant email only; hourly waits for runHourlyEmailDigest (emailedAt stays null).
    if (wantsInstantEmail(row.recipientId)) {
      await enqueue("send-notification-email", { notificationId: row.id });
    }
  }
}

/** Ping list watchers so open boards refresh. */
export async function pingListUpdate(listId: string): Promise<void> {
  await db.execute(
    sql`select pg_notify('app_events', ${JSON.stringify({ kind: "list", listId })})`,
  );
}
