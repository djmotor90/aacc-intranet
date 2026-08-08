/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, docFolders, docPages, spaces, tasks } from "@aitim/db";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
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
