/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, docFolders, docPages, spaces, tasks, users } from "@aitim/db";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { listPickerUsers } from "@/lib/directory-users";
import { requireUser } from "@/lib/rbac";
import type { AgentMentionItem, AgentMentionType } from "../lib/agent-mentions";

const LIMIT = 12;

function qLike(q: string) {
  return `%${q.replace(/[%_]/g, "").trim()}%`;
}

export async function searchAgentMentions(
  query: string,
  type: AgentMentionType | "all" = "all",
): Promise<AgentMentionItem[]> {
  await requireUser();
  const q = query.trim().toLowerCase();
  const out: AgentMentionItem[] = [];

  const want = (t: AgentMentionType) => type === "all" || type === t;

  if (want("user")) {
    const users = await listPickerUsers();
    const filtered = !q
      ? users
      : users.filter(
          (u) =>
            u.displayName.toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q),
        );
    for (const u of filtered.slice(0, LIMIT)) {
      out.push({
        type: "user",
        id: u.id,
        label: u.displayName,
        subtitle: u.email ?? "Person",
      });
    }
  }

  if (want("task")) {
    const rows = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
      })
      .from(tasks)
      .where(
        and(
          isNull(tasks.deletedAt),
          eq(tasks.isArchived, false),
          q
            ? or(ilike(tasks.title, qLike(q)), ilike(tasks.number, qLike(q)))
            : sql`true`,
        ),
      )
      .orderBy(asc(tasks.number))
      .limit(LIMIT);
    for (const r of rows) {
      out.push({
        type: "task",
        id: r.id,
        label: `${r.number} ${r.title}`.trim(),
        subtitle: "Task",
      });
    }
  }

  if (want("space")) {
    const rows = await db
      .select({ id: spaces.id, name: spaces.name, slug: spaces.slug })
      .from(spaces)
      .where(
        and(
          isNull(spaces.deletedAt),
          eq(spaces.isArchived, false),
          q ? ilike(spaces.name, qLike(q)) : sql`true`,
        ),
      )
      .orderBy(asc(spaces.name))
      .limit(LIMIT);
    for (const r of rows) {
      out.push({
        type: "space",
        id: r.id,
        label: r.name,
        subtitle: `Workspace · ${r.slug}`,
      });
    }
  }

  if (want("doc")) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title })
      .from(docPages)
      .where(
        and(
          isNull(docPages.deletedAt),
          q ? ilike(docPages.title, qLike(q)) : sql`true`,
        ),
      )
      .orderBy(asc(docPages.title))
      .limit(LIMIT);
    for (const r of rows) {
      out.push({
        type: "doc",
        id: r.id,
        label: r.title || "Untitled",
        subtitle: "Doc page",
      });
    }
  }

  if (want("folder")) {
    const rows = await db
      .select({ id: docFolders.id, name: docFolders.name })
      .from(docFolders)
      .where(
        and(
          isNull(docFolders.deletedAt),
          q ? ilike(docFolders.name, qLike(q)) : sql`true`,
        ),
      )
      .orderBy(asc(docFolders.name))
      .limit(LIMIT);
    for (const r of rows) {
      out.push({
        type: "folder",
        id: r.id,
        label: r.name,
        subtitle: "Doc folder",
      });
    }
  }

  // Rank: when "all", keep users first then others (already appended in order)
  return out.slice(0, type === "all" ? 24 : LIMIT);
}

/**
 * Current display labels for stored `@{type:id|label}` mention tokens.
 *
 * The label embedded in a token is a point-in-time snapshot captured when the
 * message was written — it never updates. Chat message rendering calls this
 * to look up each referenced entity's *current* name so chips stay accurate
 * after a doc/task/space/folder is renamed, instead of freezing whatever the
 * title happened to be at send time. Entities that no longer exist (deleted)
 * are simply omitted — callers should fall back to the stored label.
 */
export async function resolveMentionLabels(
  items: { type: AgentMentionType; id: string }[],
): Promise<Record<string, string>> {
  await requireUser();
  const out: Record<string, string> = {};

  const idsByType = new Map<AgentMentionType, Set<string>>();
  for (const it of items) {
    if (!it.id) continue;
    if (!idsByType.has(it.type)) idsByType.set(it.type, new Set());
    idsByType.get(it.type)!.add(it.id);
  }

  const userIds = [...(idsByType.get("user") ?? [])];
  if (userIds.length) {
    const rows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const r of rows) out[`user:${r.id}`] = r.displayName;
  }

  const taskIds = [...(idsByType.get("task") ?? [])];
  if (taskIds.length) {
    const rows = await db
      .select({ id: tasks.id, number: tasks.number, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, taskIds));
    for (const r of rows) out[`task:${r.id}`] = `${r.number} ${r.title}`.trim();
  }

  const spaceIds = [...(idsByType.get("space") ?? [])];
  if (spaceIds.length) {
    const rows = await db
      .select({ id: spaces.id, name: spaces.name })
      .from(spaces)
      .where(inArray(spaces.id, spaceIds));
    for (const r of rows) out[`space:${r.id}`] = r.name;
  }

  const docIds = [...(idsByType.get("doc") ?? [])];
  if (docIds.length) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title })
      .from(docPages)
      .where(inArray(docPages.id, docIds));
    for (const r of rows) out[`doc:${r.id}`] = r.title || "Untitled";
  }

  const folderIds = [...(idsByType.get("folder") ?? [])];
  if (folderIds.length) {
    const rows = await db
      .select({ id: docFolders.id, name: docFolders.name })
      .from(docFolders)
      .where(inArray(docFolders.id, folderIds));
    for (const r of rows) out[`folder:${r.id}`] = r.name;
  }

  return out;
}
