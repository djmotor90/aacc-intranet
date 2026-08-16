"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, modules, sidebarNavItems } from "@aitim/db";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/rbac";
import { resolveNavIcon, type NavItem } from "@/modules/registry";
import { BUILTIN_NAV, moduleNavKey, NAV_ICONS } from "../nav-catalog";

export type SidebarNavAdminRow = {
  id: string;
  key: string;
  kind: string;
  label: string;
  href: string;
  icon: string;
  hidden: boolean;
  adminOnly: boolean;
  locked: boolean;
  moduleId: string | null;
  position: number;
};

async function ensureSidebarNavCatalog() {
  const [existing, moduleRows] = await Promise.all([
    db
      .select({
        id: sidebarNavItems.id,
        key: sidebarNavItems.key,
        moduleId: sidebarNavItems.moduleId,
        position: sidebarNavItems.position,
      })
      .from(sidebarNavItems),
    db
      .select({
        id: modules.id,
        slug: modules.slug,
        name: modules.name,
        icon: modules.icon,
        isEnabled: modules.isEnabled,
      })
      .from(modules),
  ]);

  const have = new Set(existing.map((row) => row.key));
  const maxPos = existing.reduce((max, row) => Math.max(max, row.position), -1);
  let nextPos = maxPos + 1;
  const inserts: {
    key: string;
    kind: string;
    label: string;
    href: string;
    icon: string;
    adminOnly: boolean;
    locked: boolean;
    moduleId: string | null;
    position: number;
  }[] = [];

  // First seed: insert builtins in catalog order, then modules.
  const empty = existing.length === 0;
  if (empty) {
    const tasks = moduleRows.find((m) => m.slug === "tasks");
    let pos = 0;
    for (const item of BUILTIN_NAV) {
      if (item.key === "home") {
        inserts.push({
          key: item.key,
          kind: "builtin",
          label: item.label,
          href: item.href,
          icon: item.icon,
          adminOnly: Boolean(item.adminOnly),
          locked: Boolean(item.locked),
          moduleId: null,
          position: pos++,
        });
        have.add(item.key);
        if (tasks) {
          inserts.push({
            key: moduleNavKey(tasks.id),
            kind: "module",
            label: tasks.name,
            href: "/tasks",
            icon: tasks.icon || "tasks",
            adminOnly: false,
            locked: false,
            moduleId: tasks.id,
            position: pos++,
          });
          have.add(moduleNavKey(tasks.id));
        }
        continue;
      }
      inserts.push({
        key: item.key,
        kind: "builtin",
        label: item.label,
        href: item.href,
        icon: item.icon,
        adminOnly: Boolean(item.adminOnly),
        locked: Boolean(item.locked),
        moduleId: null,
        position: pos++,
      });
      have.add(item.key);
    }
    for (const mod of moduleRows) {
      const key = moduleNavKey(mod.id);
      if (have.has(key)) continue;
      inserts.push({
        key,
        kind: "module",
        label: mod.name,
        href: mod.slug === "tasks" ? "/tasks" : `/w/${mod.slug}`,
        icon: mod.icon || "building",
        adminOnly: false,
        locked: false,
        moduleId: mod.id,
        position: pos++,
      });
      have.add(key);
    }
    nextPos = pos;
  } else {
    for (const item of BUILTIN_NAV) {
      if (have.has(item.key)) continue;
      inserts.push({
        key: item.key,
        kind: "builtin",
        label: item.label,
        href: item.href,
        icon: item.icon,
        adminOnly: Boolean(item.adminOnly),
        locked: Boolean(item.locked),
        moduleId: null,
        position: nextPos++,
      });
      have.add(item.key);
    }
    for (const mod of moduleRows) {
      const key = moduleNavKey(mod.id);
      if (have.has(key)) continue;
      inserts.push({
        key,
        kind: "module",
        label: mod.name,
        href: mod.slug === "tasks" ? "/tasks" : `/w/${mod.slug}`,
        icon: mod.icon || "building",
        adminOnly: false,
        locked: false,
        moduleId: mod.id,
        position: nextPos++,
      });
      have.add(key);
    }
  }

  if (inserts.length > 0) {
    await db.insert(sidebarNavItems).values(inserts);
  }

  const liveModuleIds = new Set(moduleRows.map((m) => m.id));
  const stale = existing.filter((row) => row.moduleId && !liveModuleIds.has(row.moduleId));
  if (stale.length > 0) {
    await db.delete(sidebarNavItems).where(
      inArray(
        sidebarNavItems.id,
        stale.map((row) => row.id),
      ),
    );
  }
}

function toAdminRow(row: typeof sidebarNavItems.$inferSelect): SidebarNavAdminRow {
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    label: row.label,
    href: row.href,
    icon: row.icon,
    hidden: row.hidden,
    adminOnly: row.adminOnly,
    locked: row.locked,
    moduleId: row.moduleId,
    position: row.position,
  };
}

export async function getSidebarNavAdmin(): Promise<SidebarNavAdminRow[]> {
  await requireAdmin();
  await ensureSidebarNavCatalog();
  const rows = await db.select().from(sidebarNavItems).orderBy(asc(sidebarNavItems.position), asc(sidebarNavItems.label));
  return rows.map(toAdminRow);
}

export async function getSidebarNavForUser(): Promise<NavItem[]> {
  const user = await requireUser();
  try {
    await ensureSidebarNavCatalog();
  } catch {
    // Table may not be migrated yet — fall through to empty and let layout use fallback.
    return [];
  }
  const rows = await db.select().from(sidebarNavItems).orderBy(asc(sidebarNavItems.position), asc(sidebarNavItems.label));
  const isAdmin = user.platformRole === "admin";
  return rows
    .filter((row) => !row.hidden)
    .filter((row) => !row.adminOnly || isAdmin)
    .map((row) => ({
      label: row.label,
      href: row.href,
      icon: resolveNavIcon(row.icon),
      moduleId: row.moduleId ?? undefined,
      moduleSlug: row.kind === "module" ? row.href.replace(/^\/w\//, "").replace(/^\//, "") : undefined,
    }));
}

export async function updateSidebarNavItem(input: {
  id: string;
  label?: string;
  icon?: string;
  hidden?: boolean;
}) {
  await requireAdmin();
  const id = z.string().uuid().parse(input.id);
  const [row] = await db.select().from(sidebarNavItems).where(eq(sidebarNavItems.id, id));
  if (!row) throw new Error("Menu item not found");
  if (row.locked && input.hidden === true) {
    throw new Error("Home cannot be hidden");
  }
  const label =
    input.label === undefined ? undefined : z.string().min(1).max(40).parse(input.label.trim());
  const icon = input.icon === undefined ? undefined : z.enum(NAV_ICONS).parse(input.icon);
  const hidden = input.hidden === undefined ? undefined : z.boolean().parse(input.hidden);

  await db
    .update(sidebarNavItems)
    .set({
      ...(label !== undefined ? { label } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(hidden !== undefined ? { hidden } : {}),
    })
    .where(eq(sidebarNavItems.id, id));

  if (label && row.moduleId) {
    await db.update(modules).set({ name: label }).where(eq(modules.id, row.moduleId));
  }
  if (icon && row.moduleId) {
    await db.update(modules).set({ icon }).where(eq(modules.id, row.moduleId));
  }

  revalidatePath("/", "layout");
}

export async function reorderSidebarNav(orderedIds: string[]) {
  await requireAdmin();
  const ids = z.array(z.string().uuid()).min(1).parse(orderedIds);
  const rows = await db.select({ id: sidebarNavItems.id }).from(sidebarNavItems);
  const have = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !have.has(id)) || ids.length !== have.size) {
    throw new Error("Menu order is out of date — refresh and try again");
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(sidebarNavItems).set({ position: i }).where(eq(sidebarNavItems.id, ids[i]));
    }
  });
  revalidatePath("/", "layout");
}

export async function syncModuleToSidebarNav(moduleId: string) {
  const [mod] = await db.select().from(modules).where(eq(modules.id, moduleId));
  if (!mod) return;
  const key = moduleNavKey(mod.id);
  const href = mod.slug === "tasks" ? "/tasks" : `/w/${mod.slug}`;
  const [existing] = await db
    .select({ id: sidebarNavItems.id })
    .from(sidebarNavItems)
    .where(eq(sidebarNavItems.key, key));
  if (existing) {
    await db
      .update(sidebarNavItems)
      .set({
        label: mod.name,
        href,
        icon: mod.icon || "building",
        hidden: !mod.isEnabled,
      })
      .where(eq(sidebarNavItems.id, existing.id));
    revalidatePath("/", "layout");
    return;
  }
  const positions = await db.select({ position: sidebarNavItems.position }).from(sidebarNavItems);
  const max = positions.reduce((m, r) => Math.max(m, r.position), -1);
  await db.insert(sidebarNavItems).values({
    key,
    kind: "module",
    label: mod.name,
    href,
    icon: mod.icon || "building",
    hidden: !mod.isEnabled,
    moduleId: mod.id,
    position: max + 1,
  });
  revalidatePath("/", "layout");
}
