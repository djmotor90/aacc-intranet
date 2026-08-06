"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, lists, listViews, spaces } from "@aitim/db";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, assertSpaceRole, getListRole, requireUser } from "@/lib/rbac";
import { listPath, requireList, requireTask } from "./shared";

const filterConditionSchema = z.array(
  z.object({
    field: z.string().max(60),
    op: z.string().max(20),
    value: z.string().max(500),
    conjunction: z.enum(["and", "or"]).optional(),
  }),
).max(20);

/** Follow-up page fetch for the infinite-scrolling task table. */
export async function fetchTasksPage(params: {
  listId: string;
  conditions?: unknown;
  groupBy?: string;
  sort?: { fieldId: string; dir: "asc" | "desc" } | null;
  offset: number;
  limit?: number;
  /** Include done/cancelled status tasks (default false). */
  showClosed?: boolean;
  /**
   * When true (e.g. soft group-by change), recompute total + groupCounts.
   * Default false for scroll pagination (counts already known).
   */
  includeCounts?: boolean;
}) {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  await assertListRole(listId, "guest");
  const conditions = filterConditionSchema.parse(params.conditions ?? []);
  const limit = Math.min(Math.max(z.number().int().optional().parse(params.limit) ?? 200, 1), 500);
  const offset = z.number().int().min(0).max(1_000_000).parse(params.offset);
  // Sort key: custom-field UUID or native column id (title, status, due, …).
  const sort = params.sort
    ? {
        fieldId: z
          .string()
          .min(1)
          .max(60)
          .parse(params.sort.fieldId),
        dir: z.enum(["asc", "desc"]).parse(params.sort.dir),
      }
    : null;
  const groupBy = params.groupBy ? z.string().max(60).parse(params.groupBy) : undefined;
  const showClosed = params.showClosed === true;
  const includeCounts = params.includeCounts === true;

  const { getTasksPage } = await import("../queries");
  return getTasksPage({
    listId,
    conditions,
    groupBy,
    sort,
    limit,
    offset,
    showClosed,
    countsAlreadyKnown: !includeCounts,
  });
}

/** Direct children of a task, table-row shaped — fetched on first inline expand. */
export async function fetchTaskChildren(parentTaskId: string) {
  "use server";
  const id = z.string().uuid().parse(parentTaskId);
  const { list } = await requireTask(id);
  await assertListRole(list.id, "guest");
  const { getChildTasks } = await import("../queries");
  return getChildTasks(id);
}

export async function saveTableColumnOrder(
  listId: string,
  order: string[],
  /** When set, column order is stored on this named view. */
  viewId?: string,
) {
  "use server";
  await requireUser();
  const { list } = await requireList(listId);
  // Any list member (direct or inherited from the space) can save their own column layout
  const user = await (await import("@/lib/auth")).auth();
  if (!user?.user?.id) return;
  const role = await getListRole(user.user.id, list.id, (user.user as { platformRole?: string }).platformRole ?? "member");
  if (!role) return;

  if (viewId) {
    const id = z.string().uuid().parse(viewId);
    await db
      .update(listViews)
      .set({ tableColumnOrder: order })
      .where(and(eq(listViews.id, id), eq(listViews.listId, list.id)));
    return;
  }

  await db.update(lists).set({ tableColumnOrder: order }).where(eq(lists.id, list.id));
  // No revalidatePath needed — client reads this on next load via prop
}

/**
 * Persist prefs for the active named view (preferred) or fall back to legacy
 * list-level defaultView/defaultGroupBy when no viewId is provided.
 */
export async function saveListViewPrefs(
  listId: string,
  prefs: {
    view?: string;
    groupBy?: string;
    filters?: unknown;
    showClosed?: boolean;
    /** When set, writes into this named list_view instead of the list row. */
    viewId?: string;
  },
) {
  "use server";
  const { list } = await requireList(listId);
  const session = await (await import("@/lib/auth")).auth();
  if (!session?.user?.id) return;
  const role = await getListRole(
    session.user.id,
    list.id,
    (session.user as { platformRole?: string }).platformRole ?? "member",
  );
  if (!role) return;

  if (prefs.viewId) {
    const viewId = z.string().uuid().parse(prefs.viewId);
    const [row] = await db
      .select()
      .from(listViews)
      .where(and(eq(listViews.id, viewId), eq(listViews.listId, listId)));
    if (!row) return;

    const updates: Partial<typeof listViews.$inferInsert> = {};
    if ("view" in prefs && prefs.view) updates.type = prefs.view === "board" ? "board" : "table";
    if ("groupBy" in prefs) updates.groupBy = prefs.groupBy || null;
    if ("filters" in prefs) updates.filters = prefs.filters ?? [];
    if ("showClosed" in prefs) updates.showClosed = prefs.showClosed === true;
    if (Object.keys(updates).length === 0) return;

    await db.update(listViews).set(updates).where(eq(listViews.id, viewId));
    // No revalidatePath — client already updated URL/rows; full RSC refresh
    // was adding ~0.5–1s and stacking with fetchTasksPage.
    return;
  }

  // Legacy list-level defaults (still used when no named view is active).
  const updates: Record<string, string | null> = {};
  if ("view" in prefs) updates.defaultView = prefs.view ?? null;
  if ("groupBy" in prefs) updates.defaultGroupBy = prefs.groupBy || null;
  if (Object.keys(updates).length === 0) return;

  await db.update(lists).set(updates).where(eq(lists.id, list.id));
}

async function requireListView(viewId: string) {
  const [row] = await db
    .select({ view: listViews, list: lists, space: spaces })
    .from(listViews)
    .innerJoin(lists, eq(listViews.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(listViews.id, viewId));
  if (!row) throw new Error("View not found");
  return row;
}

function nextViewPosition(existing: { position: string }[]): string {
  // Simple suffix: a0, a1, … a9, b0 — enough for dozens of views.
  const n = existing.length;
  const letter = String.fromCharCode(97 + Math.floor(n / 10));
  return `${letter}${n % 10}`;
}

/** Create a named view on a list. Optionally clone settings from another view. */
export async function createListView(params: {
  listId: string;
  name?: string;
  type?: "table" | "board";
  copyFromViewId?: string;
}): Promise<{ id: string }> {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  const type = params.type === "board" ? "board" : "table";
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_views");
  await assertListRole(listId, "member");
  const { list, space } = await requireList(listId);

  const existing = await db
    .select()
    .from(listViews)
    .where(eq(listViews.listId, listId))
    .orderBy(asc(listViews.position));

  let filters: unknown = [];
  let groupBy: string | null = null;
  let showClosed = false;
  let tableColumnOrder: unknown = null;

  if (params.copyFromViewId) {
    const srcId = z.string().uuid().parse(params.copyFromViewId);
    const [src] = await db
      .select()
      .from(listViews)
      .where(and(eq(listViews.id, srcId), eq(listViews.listId, listId)));
    if (src) {
      filters = src.filters;
      groupBy = src.groupBy;
      showClosed = src.showClosed;
      tableColumnOrder = src.tableColumnOrder;
    }
  }

  const baseName = (params.name?.trim() || (type === "board" ? "Board" : "List")).slice(0, 60);
  // Unique-ish name: "List", "List 2", "List 3"…
  let name = baseName;
  let i = 2;
  const names = new Set(existing.map((v) => v.name.toLowerCase()));
  while (names.has(name.toLowerCase())) {
    name = `${baseName} ${i++}`;
  }

  const [created] = await db
    .insert(listViews)
    .values({
      listId,
      name,
      type,
      filters,
      groupBy,
      showClosed,
      tableColumnOrder,
      position: nextViewPosition(existing),
      createdBy: user.id,
    })
    .returning({ id: listViews.id });

  revalidatePath(listPath(space.slug, list.slug));
  return { id: created.id };
}

/** Rename a named view (ClickUp double-click / edit). */
export async function renameListView(viewId: string, name: string) {
  "use server";
  const parsed = z.string().min(1).max(60).parse(name.trim());
  const { view, list, space } = await requireListView(viewId);
  await assertListRole(list.id, "member");

  await db.update(listViews).set({ name: parsed }).where(eq(listViews.id, view.id));
  revalidatePath(listPath(space.slug, list.slug));
}

/** Delete a named view. Refuses to delete the last remaining view on the list. */
export async function deleteListView(viewId: string) {
  "use server";
  const { view, list, space } = await requireListView(viewId);
  await assertListRole(list.id, "member");

  const siblings = await db
    .select({ id: listViews.id })
    .from(listViews)
    .where(eq(listViews.listId, list.id));
  if (siblings.length <= 1) throw new Error("Cannot delete the last view");

  // Form views own a public_forms row — remove it with submissions.
  if (view.type === "form") {
    const { deleteFormForView } = await import("./forms");
    await deleteFormForView(view.id);
  }

  await db.delete(listViews).where(eq(listViews.id, view.id));
  revalidatePath(listPath(space.slug, list.slug));
}

/**
 * Persist a new tab order after drag-and-drop. `orderedIds` is the full set of
 * view ids for the list in left-to-right order.
 */
export async function reorderListViews(listId: string, orderedIds: string[]) {
  "use server";
  const listUuid = z.string().uuid().parse(listId);
  const ids = z.array(z.string().uuid()).min(1).max(100).parse(orderedIds);
  const { list, space } = await requireList(listUuid);
  await assertListRole(list.id, "member");

  const existing = await db
    .select({ id: listViews.id })
    .from(listViews)
    .where(eq(listViews.listId, list.id));
  const existingIds = new Set(existing.map((r) => r.id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
    throw new Error("Invalid view order");
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(listViews)
        .set({ position: `a${i}` })
        .where(and(eq(listViews.id, ids[i]), eq(listViews.listId, list.id)));
    }
  });
  revalidatePath(listPath(space.slug, list.slug));
}

/** Persist the full config of a named view (filters, groupBy, closed, type, columns). */
export async function updateListViewConfig(
  viewId: string,
  config: {
    filters?: unknown;
    groupBy?: string | null;
    showClosed?: boolean;
    type?: "table" | "board";
    tableColumnOrder?: unknown;
  },
) {
  "use server";
  const { view, list, space } = await requireListView(viewId);
  await assertListRole(list.id, "guest"); // guests can browse but not mutate — use member
  const user = await requireUser();
  const role = await getListRole(user.id, list.id, user.platformRole);
  if (!role || role === "guest") return;

  const updates: Partial<typeof listViews.$inferInsert> = {};
  if ("filters" in config) updates.filters = config.filters ?? [];
  if ("groupBy" in config) updates.groupBy = config.groupBy || null;
  if ("showClosed" in config) updates.showClosed = config.showClosed === true;
  if ("type" in config && config.type) updates.type = config.type === "board" ? "board" : "table";
  if ("tableColumnOrder" in config) updates.tableColumnOrder = config.tableColumnOrder ?? null;
  if (Object.keys(updates).length === 0) return;

  await db.update(listViews).set(updates).where(eq(listViews.id, view.id));
  revalidatePath(listPath(space.slug, list.slug));
}

export async function saveTaskLayout(
  listId: string,
  layout: import("../layout-types").TaskLayout,
) {
  "use server";
  await requireUser();
  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");

  await db.update(lists).set({ taskLayout: layout }).where(eq(lists.id, list.id));

  revalidatePath(`/tasks/${space.slug}/${list.slug}`);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}
