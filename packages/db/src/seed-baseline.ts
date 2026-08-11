/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Production / new-client baseline seed.
 * Idempotent. No demo tasks or fake spaces.
 *
 * Env (optional):
 *   CLIENT_ADMIN_EMAIL   break-glass Super Admin email (default: none created)
 *   CLIENT_ADMIN_NAME    display name (default: "Platform Admin")
 *   CLIENT_DISPLAY_NAME  logged only
 */
import { eq } from "drizzle-orm";
import { db, getPool } from "./index";
import { agents, modules, permissionRoles, users } from "./schema/index";

/** Sensible defaults for system roles (matches app permission catalog keys). */
const ROLE_PRESETS: {
  slug: string;
  name: string;
  description: string;
  position: string;
  permissions: Record<string, boolean>;
}[] = [
  {
    slug: "guest",
    name: "Guest",
    description: "Read-oriented access; limited create.",
    position: "a0",
    permissions: {
      comment: true,
      delete_own_only: true,
    },
  },
  {
    slug: "member",
    name: "Member",
    description: "Standard contributor across tasks and docs.",
    position: "a1",
    permissions: {
      create_tasks: true,
      edit_tasks: true,
      comment: true,
      manage_attachments: true,
      create_docs: true,
      edit_docs: true,
      create_views: true,
      create_custom_fields: false,
      edit_custom_fields: false,
      export_views: true,
      delete_own_only: true,
    },
  },
  {
    slug: "owner",
    name: "Admin",
    description: "Space administrator with full control of that space (not Super Admin).",
    position: "a2",
    permissions: {
      manage_users: false,
      manage_groups: false,
      manage_roles: false,
      manage_space_members: true,
      manage_list_members: true,
      manage_trash: false,
      create_spaces: false,
      create_lists: true,
      create_folders: true,
      create_views: true,
      create_tasks: true,
      edit_tasks: true,
      comment: true,
      manage_attachments: true,
      manage_statuses: true,
      manage_tags: true,
      create_docs: true,
      edit_docs: true,
      manage_docs: true,
      manage_custom_fields: true,
      create_custom_fields: true,
      edit_custom_fields: true,
      delete_items: true,
      export_views: true,
    },
  },
];

async function upsertModule(slug: string, name: string, icon: string, position: string) {
  const [row] = await db
    .insert(modules)
    .values({
      slug,
      name,
      icon,
      position,
      isSystem: true,
      isEnabled: true,
    })
    .onConflictDoUpdate({
      target: modules.slug,
      set: {
        name,
        icon,
        isSystem: true,
        isEnabled: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

async function upsertRole(preset: (typeof ROLE_PRESETS)[number]) {
  const existing = await db
    .select()
    .from(permissionRoles)
    .where(eq(permissionRoles.slug, preset.slug))
    .limit(1);
  if (existing[0]) {
    // Do not overwrite custom permission tweaks on re-seed — only fill empty-ish.
    const perms = (existing[0].permissions ?? {}) as Record<string, boolean>;
    if (Object.keys(perms).length === 0) {
      await db
        .update(permissionRoles)
        .set({
          permissions: preset.permissions,
          name: preset.name,
          description: preset.description,
          updatedAt: new Date(),
        })
        .where(eq(permissionRoles.id, existing[0].id));
    }
    return existing[0];
  }
  const [row] = await db
    .insert(permissionRoles)
    .values({
      slug: preset.slug,
      name: preset.name,
      description: preset.description,
      isSystem: true,
      position: preset.position,
      permissions: preset.permissions,
    })
    .returning();
  return row;
}

async function main() {
  const clientName = process.env.CLIENT_DISPLAY_NAME?.trim() || "client";
  console.log(`[seed-baseline] Starting baseline for: ${clientName}`);

  // Only Tasks is a workspace module (spaces/lists). Docs and Chat are first-class
  // code modules (`/docs`, `/chat`) — never seed them into `modules` or the sidebar
  // will show a second empty "Docs" entry linking to `/w/docs`.
  await upsertModule("tasks", "Tasks", "tasks", "a0");
  // Drop legacy empty workspace rows that collide with built-in apps.
  await db.delete(modules).where(eq(modules.slug, "docs"));
  await db.delete(modules).where(eq(modules.slug, "chat"));
  console.log("[seed-baseline] Modules: tasks (docs/chat are code modules, not workspace apps)");

  for (const preset of ROLE_PRESETS) {
    await upsertRole(preset);
  }
  console.log("[seed-baseline] Permission roles: guest, member, owner (displayed as Admin)");

  const adminEmail = process.env.CLIENT_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    const adminName = process.env.CLIENT_ADMIN_NAME?.trim() || "Platform Admin";
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);
    if (existing[0]) {
      await db
        .update(users)
        .set({
          displayName: adminName,
          platformRole: "admin",
          isProtectedAdmin: true,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id));
      console.log(`[seed-baseline] Updated Super Admin: ${adminEmail}`);
    } else {
      await db.insert(users).values({
        email: adminEmail,
        displayName: adminName,
        platformRole: "admin",
        isProtectedAdmin: true,
        isActive: true,
        jobTitle: "Administrator",
      });
      console.log(`[seed-baseline] Created Super Admin: ${adminEmail}`);
    }
  } else {
    console.log(
      "[seed-baseline] No CLIENT_ADMIN_EMAIL — skipped admin user (set env to create break-glass admin).",
    );
  }

  // AACC Hub Super Agents for Chat
  const seedAgents: {
    slug: string;
    displayName: string;
    title: string;
    description: string;
    avatarEmoji: string;
    systemPrompt: string;
    tools: string[];
  }[] = [
    {
      slug: "deadline-dale",
      displayName: "Deadline Dale",
      title: "Deadline enforcer",
      description: "Nags you about overdue work with a dry sense of humor.",
      avatarEmoji: "⏰",
      systemPrompt:
        "You are Deadline Dale, a Super Agent who tracks overdue and due-soon tasks. Be direct, a little dry, and helpful. List concrete tasks with due dates when relevant.",
      tools: ["tasks.list_overdue", "tasks.search"],
    },
    {
      slug: "ops-brief",
      displayName: "Ops Brief",
      title: "Daily operations summary",
      description: "Quick operational briefings for open work.",
      avatarEmoji: "📋",
      systemPrompt:
        "You are Ops Brief, a Super Agent that summarizes open operational work. Be concise and structured.",
      tools: ["tasks.list_overdue", "tasks.search"],
    },
  ];

  for (const a of seedAgents) {
    const existing = await db.select().from(agents).where(eq(agents.slug, a.slug)).limit(1);
    if (existing[0]) {
      await db
        .update(agents)
        .set({
          displayName: a.displayName,
          title: a.title,
          description: a.description,
          avatarEmoji: a.avatarEmoji,
          systemPrompt: a.systemPrompt,
          tools: a.tools,
          isEnabled: true,
          isSystem: true,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, existing[0].id));
    } else {
      await db.insert(agents).values({
        slug: a.slug,
        displayName: a.displayName,
        title: a.title,
        description: a.description,
        avatarEmoji: a.avatarEmoji,
        systemPrompt: a.systemPrompt,
        tools: a.tools,
        runtime: "stub",
        isEnabled: true,
        isSystem: true,
      });
    }
  }
  console.log("[seed-baseline] Super Agents: deadline-dale, ops-brief");

  console.log("[seed-baseline] Complete.");
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
