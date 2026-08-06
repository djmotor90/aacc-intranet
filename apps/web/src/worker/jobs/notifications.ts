/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  db,
  notificationPreferences,
  notifications,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { sendMail } from "@/lib/mailer";
import { resolveTypePrefs } from "@/lib/notification-prefs";
import type { NotificationType } from "@/lib/notify";
import { notifyUsers } from "@/lib/notify";

const TYPE_LABELS: Record<string, string> = {
  assigned: "You were assigned to a task",
  mentioned: "You were mentioned",
  comment: "New comment",
  status_changed: "Status changed",
  due_soon: "Task due soon",
  form_submission: "New customer request",
};

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowDetail(
  type: string,
  payload: unknown,
): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (type === "status_changed") {
    return `Status: ${p.from ?? "?"} → ${p.to ?? "?"}`;
  }
  if (type === "comment" || type === "mentioned") {
    const preview = String(p.preview ?? "").trim();
    return preview ? `“${preview.slice(0, 200)}”` : "";
  }
  if (type === "due_soon" && p.dueDate) {
    return `Due ${String(p.dueDate)}`;
  }
  return "";
}

/** Instant email for one notification (skipped when digest is hourly/off). */
export async function sendNotificationEmail(notificationId: string): Promise<string> {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, notificationId));
  if (!n) return "notification gone";
  if (n.emailedAt) return "already emailed";

  const [recipient] = await db.select().from(users).where(eq(users.id, n.recipientId));
  if (!recipient?.isActive) return "recipient inactive";

  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, n.recipientId));

  const digest = prefs?.emailDigest ?? "instant";
  if (digest === "off") return "email disabled by preference";
  // Hourly: leave for runHourlyEmailDigest (emailedAt stays null).
  if (digest === "hourly") return "hourly digest — deferred";

  const channel = resolveTypePrefs(prefs?.preferences, n.type as NotificationType);
  if (!channel.email) return "type email disabled";

  const task = n.taskId
    ? (await db.select().from(tasks).where(eq(tasks.id, n.taskId)))[0]
    : undefined;
  const actor = n.actorId
    ? (await db.select().from(users).where(eq(users.id, n.actorId)))[0]
    : undefined;

  const base = appBaseUrl();
  const taskLink = task ? `${base}/tasks/task/${encodeURIComponent(task.number)}` : `${base}/notifications`;
  const title = TYPE_LABELS[n.type] ?? "Notification";
  const detail = rowDetail(n.type, n.payload);

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.45;color:#173438;border-top:4px solid #007582;padding-top:20px">
      <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(title)}</h2>
      ${actor ? `<p style="margin:0 0 4px;color:#53686b">by ${escapeHtml(actor.displayName)}</p>` : ""}
      ${task ? `<p style="margin:0 0 4px"><strong>${escapeHtml(task.number)}</strong> — ${escapeHtml(task.title)}</p>` : ""}
      ${detail ? `<p style="margin:0 0 12px;color:#15515a">${escapeHtml(detail)}</p>` : ""}
      <p style="margin:16px 0 0">
        <a href="${taskLink}" style="display:inline-block;background:#007582;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:14px">
          Open in AACC Operations Hub
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
        <a href="${base}/notifications" style="color:#007582">All notifications</a>
        · manage email in Settings → Preferences
      </p>
    </div>`;

  await sendMail({
    to: recipient.email,
    subject: `[AACC Operations Hub] ${title}${task ? ` · ${task.number}` : ""}`,
    html,
  });
  await db
    .update(notifications)
    .set({ emailedAt: new Date() })
    .where(eq(notifications.id, notificationId));
  return `emailed ${recipient.email}`;
}

/**
 * Hourly batch: one email per user with emailDigest=hourly, listing all
 * not-yet-emailed notifications that have email enabled for that type.
 */
export async function runHourlyEmailDigest(): Promise<string> {
  const hourlyPrefs = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.emailDigest, "hourly"));

  if (hourlyPrefs.length === 0) return "no hourly digest users";

  const base = appBaseUrl();
  // Look back up to 26h so a missed run still catches up; already-emailed are skipped.
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000);

  let usersEmailed = 0;
  let notifSent = 0;

  for (const pref of hourlyPrefs) {
    const [recipient] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, pref.userId), eq(users.isActive, true)))
      .limit(1);
    if (!recipient?.email) continue;

    const pending = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        payload: notifications.payload,
        createdAt: notifications.createdAt,
        actorId: notifications.actorId,
        taskId: notifications.taskId,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, pref.userId),
          isNull(notifications.emailedAt),
          gte(notifications.createdAt, since),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(100);

    const eligible = pending.filter((n) =>
      resolveTypePrefs(pref.preferences, n.type as NotificationType).email,
    );
    if (eligible.length === 0) continue;

    const taskIds = [...new Set(eligible.map((n) => n.taskId).filter(Boolean))] as string[];
    const actorIds = [...new Set(eligible.map((n) => n.actorId).filter(Boolean))] as string[];

    const taskRows =
      taskIds.length > 0
        ? await db
            .select({ id: tasks.id, number: tasks.number, title: tasks.title })
            .from(tasks)
            .where(inArray(tasks.id, taskIds))
        : [];
    const actorRows =
      actorIds.length > 0
        ? await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, actorIds))
        : [];

    const taskById = new Map(taskRows.map((t) => [t.id, t]));
    const actorById = new Map(actorRows.map((a) => [a.id, a]));

    const itemsHtml = eligible
      .map((n) => {
        const title = TYPE_LABELS[n.type] ?? n.type;
        const task = n.taskId ? taskById.get(n.taskId) : undefined;
        const actor = n.actorId ? actorById.get(n.actorId) : undefined;
        const detail = rowDetail(n.type, n.payload);
        const link = task
          ? `${base}/tasks/task/${encodeURIComponent(task.number)}`
          : `${base}/notifications`;
        const when = n.createdAt.toISOString().slice(0, 16).replace("T", " ");
        return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
              <div style="font-weight:600;font-size:14px;color:#173438">${escapeHtml(title)}</div>
              ${actor ? `<div style="font-size:12px;color:#53686b;margin-top:2px">by ${escapeHtml(actor.displayName)}</div>` : ""}
              ${task ? `<div style="font-size:13px;margin-top:4px"><a href="${link}" style="color:#007582;text-decoration:none"><strong>${escapeHtml(task.number)}</strong> — ${escapeHtml(task.title)}</a></div>` : ""}
              ${detail ? `<div style="font-size:12px;color:#475569;margin-top:4px">${escapeHtml(detail)}</div>` : ""}
              <div style="font-size:11px;color:#94a3b8;margin-top:6px">${when} UTC</div>
            </td>
          </tr>`;
      })
      .join("");

    const count = eligible.length;
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;line-height:1.45;color:#173438;border-top:4px solid #007582;padding-top:20px">
        <h2 style="margin:0 0 4px;font-size:18px">Your AACC Operations Hub digest</h2>
        <p style="margin:0 0 16px;color:#53686b;font-size:14px">
          ${count} update${count === 1 ? "" : "s"} since the last digest.
        </p>
        <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
        <p style="margin:20px 0 0">
          <a href="${base}/notifications" style="display:inline-block;background:#007582;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:14px">
            Open notifications
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
          You’re on hourly email digest.
          Change this anytime in the app: Notifications → Preferences.
        </p>
      </div>`;

    try {
      await sendMail({
        to: recipient.email,
        subject: `[AACC Operations Hub] Hourly digest · ${count} update${count === 1 ? "" : "s"}`,
        html,
      });
      const ids = eligible.map((n) => n.id);
      await db
        .update(notifications)
        .set({ emailedAt: new Date() })
        .where(inArray(notifications.id, ids));
      usersEmailed += 1;
      notifSent += count;
    } catch (err) {
      console.error(`[email-digest] failed for ${recipient.email}`, err);
    }
  }

  return `digest emailed ${usersEmailed} users · ${notifSent} notifications`;
}

/** Daily: notify assignees of open tasks due today or tomorrow. */
export async function runDueSoonScanner(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const dueTasks = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(
      and(
        gte(tasks.dueDate, today),
        lte(tasks.dueDate, tomorrow),
        isNull(tasks.completedAt),
        eq(tasks.isArchived, false),
      ),
    );

  let notified = 0;
  for (const task of dueTasks) {
    const assignees = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, task.id));
    if (assignees.length === 0) continue;
    await notifyUsers({
      recipientIds: assignees.map((a) => a.userId),
      type: "due_soon",
      taskId: task.id,
      payload: { number: task.number, title: task.title, dueDate: task.dueDate },
    });
    notified += assignees.length;
  }
  return `notified ${notified} assignees across ${dueTasks.length} due tasks`;
}
