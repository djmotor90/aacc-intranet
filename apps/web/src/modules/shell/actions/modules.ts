"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, modules, spaces } from "@aitim/db";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { MODULE_ICONS, type WorkspaceModuleRow } from "@/modules/shell/module-types";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}

/**
 * Slugs owned by first-class app routes / shell nav — never workspace modules.
 * Only `tasks` is a real system workspace module (spaces/lists live under it).
 * Docs and Chat are code modules (`/docs`, `/chat`), not rows in `modules`.
 */
const RESERVED_SLUGS = new Set([
  "tasks",
  "docs",
  "chat",
  "admin",
  "api",
  "login",
  "directory",
  "notifications",
  "settings",
  "w",
  "m",
  "task",
  "trash",
  "home",
]);

/** Built-in product apps that must not appear as empty `/w/:slug` workspace modules. */
const BUILTIN_APP_SLUGS = ["docs", "chat"] as const;

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let n = 2;

  while (true) {
    if (RESERVED_SLUGS.has(candidate) && candidate !== base) {
      candidate = `${base}-${n++}`;
      continue;
    }
    const existing = await db
      .select({ id: modules.id })
      .from(modules)
      .where(
        and(eq(modules.slug, candidate), excludeId ? ne(modules.id, excludeId) : undefined),
      );
    if (existing.length === 0 && (!RESERVED_SLUGS.has(candidate) || candidate === "tasks")) {
      return candidate;
    }
    candidate = `${base}-${n++}`;
  }
}

/**
 * Remove legacy workspace rows that collide with first-class apps (e.g. seeded "docs").
 * Empty modules are deleted; any that somehow have spaces are disabled so they stay out of nav.
 */
async function purgeBuiltinAppWorkspaceModules(): Promise<void> {
  const rows = await db
    .select({ id: modules.id, slug: modules.slug })
    .from(modules)
    .where(inArray(modules.slug, [...BUILTIN_APP_SLUGS]));

  for (const row of rows) {
    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(spaces)
      .where(and(eq(spaces.moduleId, row.id), isNull(spaces.deletedAt)));
    const spaceCount = countRow?.n ?? 0;
    if (spaceCount === 0) {
      await db.delete(modules).where(eq(modules.id, row.id));
    } else {
      await db
        .update(modules)
        .set({ isEnabled: false, isSystem: false, updatedAt: new Date() })
        .where(eq(modules.id, row.id));
    }
  }
}

/** Ensure the system Tasks module exists and strip colliding built-in app modules. */
export async function ensureTasksModule(): Promise<void> {
  await purgeBuiltinAppWorkspaceModules();

  const [existing] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, "tasks"));
  if (existing) {
    await db
      .update(modules)
      .set({ isSystem: true, isEnabled: true })
      .where(eq(modules.id, existing.id));
    return;
  }
  await db.insert(modules).values({
    slug: "tasks",
    name: "Tasks",
    description: "Workspaces for day-to-day task management",
    icon: "tasks",
    position: "a0",
    isSystem: true,
    isEnabled: true,
  });
}

export async function getWorkspaceModulesData(): Promise<{ modules: WorkspaceModuleRow[] }> {
  await requireAdmin();
  await ensureTasksModule();

  const [moduleRows, spaceRows] = await Promise.all([
    db
      .select({
        id: modules.id,
        slug: modules.slug,
        name: modules.name,
        description: modules.description,
        icon: modules.icon,
        color: modules.color,
        position: modules.position,
        isEnabled: modules.isEnabled,
        isSystem: modules.isSystem,
      })
      .from(modules)
      .orderBy(asc(modules.position), asc(modules.name)),
    db
      .select({
        moduleId: spaces.moduleId,
        n: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(spaces)
      .where(isNull(spaces.deletedAt))
      .groupBy(spaces.moduleId),
  ]);

  const countByModule = new Map(spaceRows.map((r) => [r.moduleId, r.n]));

  return {
    modules: moduleRows.map((m) => ({
      ...m,
      spaceCount: countByModule.get(m.id) ?? 0,
    })),
  };
}

/** Public: enabled modules for the sidebar (any signed-in user). */
export async function listEnabledWorkspaceModules(): Promise<
  {
    id: string;
    slug: string;
    name: string;
    icon: string;
    color: string | null;
    position: string;
  }[]
> {
  await ensureTasksModule();
  const rows = await db
    .select({
      id: modules.id,
      slug: modules.slug,
      name: modules.name,
      icon: modules.icon,
      color: modules.color,
      position: modules.position,
    })
    .from(modules)
    .where(eq(modules.isEnabled, true))
    .orderBy(asc(modules.position), asc(modules.name));

  // Never surface built-in product apps as workspace modules (Docs/Chat live in code).
  // Only `tasks` may use a reserved slug; everything else reserved is blocked.
  return rows.filter((m) => m.slug === "tasks" || !RESERVED_SLUGS.has(m.slug));
}

export async function createWorkspaceModule(params: {
  name: string;
  description?: string;
  icon?: string;
  color?: string | null;
}) {
  await requireAdmin();
  await ensureTasksModule();

  const name = z.string().min(1).max(60).parse(params.name.trim());
  const description = params.description?.trim()
    ? z.string().max(200).parse(params.description.trim())
    : null;
  const icon = z.enum(MODULE_ICONS).parse(params.icon ?? "building");
  const color = params.color?.trim() || null;

  const base = slugify(name);
  // Do not mint docs-2 / chat-2 workspace apps that shadow first-class product routes.
  if (RESERVED_SLUGS.has(base) && base !== "tasks") {
    throw new Error(
      `"${name}" conflicts with a built-in app (${base}). Choose a different name.`,
    );
  }
  const slug = await uniqueSlug(base === "tasks" ? "app" : base);

  const existing = await db.select({ position: modules.position }).from(modules);
  const position = `a${existing.length}`;

  const [created] = await db
    .insert(modules)
    .values({
      slug,
      name,
      description,
      icon,
      color,
      position,
      isSystem: false,
      isEnabled: true,
    })
    .returning({ id: modules.id, slug: modules.slug });

  revalidatePath("/");
  return created!;
}

export async function updateWorkspaceModule(params: {
  moduleId: string;
  name: string;
  description?: string | null;
  icon?: string;
  color?: string | null;
  isEnabled?: boolean;
}) {
  await requireAdmin();
  const moduleId = z.string().uuid().parse(params.moduleId);
  const name = z.string().min(1).max(60).parse(params.name.trim());
  const description =
    params.description === undefined
      ? undefined
      : params.description === null || params.description.trim() === ""
        ? null
        : z.string().max(200).parse(params.description.trim());
  const icon = params.icon ? z.enum(MODULE_ICONS).parse(params.icon) : undefined;
  const color = params.color === undefined ? undefined : params.color?.trim() || null;
  const isEnabled = params.isEnabled === undefined ? undefined : z.boolean().parse(params.isEnabled);

  const [row] = await db.select().from(modules).where(eq(modules.id, moduleId));
  if (!row) throw new Error("Module not found");
  if (row.isSystem && isEnabled === false) {
    throw new Error("The Tasks module cannot be disabled");
  }

  await db
    .update(modules)
    .set({
      name,
      ...(description !== undefined ? { description } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(isEnabled !== undefined ? { isEnabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(modules.id, moduleId));

  revalidatePath("/");
}

export async function deleteWorkspaceModule(moduleId: string) {
  await requireAdmin();
  const id = z.string().uuid().parse(moduleId);
  const [row] = await db.select().from(modules).where(eq(modules.id, id));
  if (!row) throw new Error("Module not found");
  if (row.isSystem) throw new Error("System modules cannot be deleted");

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(spaces)
    .where(and(eq(spaces.moduleId, id)));
  if ((countRow?.n ?? 0) > 0) {
    throw new Error("Move or delete all spaces in this app before deleting it");
  }

  await db.delete(modules).where(eq(modules.id, id));
  revalidatePath("/");
}
