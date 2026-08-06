/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const platformRole = pgEnum("platform_role", ["admin", "member"]);
export const mappingTargetType = pgEnum("mapping_target_type", [
  "platform_role",
  "space_role",
  "module_access",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entraObjectId: text("entra_object_id").unique(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    jobTitle: text("job_title"),
    department: text("department"),
    managerId: uuid("manager_id"),
    photoKey: text("photo_key"),
    /**
     * When true, `photoKey` is a user-uploaded avatar — Entra photo sync must not overwrite it.
     */
    photoCustom: boolean("photo_custom").notNull().default(false),
    /**
     * Super Admin gate only (`admin` = god mode via Entra / protected).
     * App permissions for everyone else come from `permissionRoleId`.
     */
    platformRole: platformRole("platform_role").notNull().default("member"),
    /**
     * Security & Permissions role (Guest / Member / Admin / custom).
     * Null for Super Admins (full access) or until assigned (defaults to Member).
     */
    permissionRoleId: uuid("permission_role_id"),
    // Break-glass admin: never overwritten by the Entra sync job.
    isProtectedAdmin: boolean("is_protected_admin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Optional local password hash (`scrypt$salt$hash` from `@aitim/shared`).
     * Used for pre-Entra / DEV_AUTH local sign-in. Null = Entra-only (or open
     * email-only dev login when DEV_AUTH is on and no hash is set).
     */
    passwordHash: text("password_hash"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Last successful app sign-in (Entra or local credentials). */
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
    /** Last client heartbeat while the app was open — drives the "online now" presence indicator. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    index("users_manager_idx").on(t.managerId),
    index("users_permission_role_idx").on(t.permissionRoleId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager",
  }),
  groupMemberships: many(userGroupMemberships),
}));

export const entraGroups = pgTable("entra_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  entraGroupId: text("entra_group_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
});

export const userGroupMemberships = pgTable(
  "user_group_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => entraGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

export const userGroupMembershipsRelations = relations(userGroupMemberships, ({ one }) => ({
  user: one(users, { fields: [userGroupMemberships.userId], references: [users.id] }),
  group: one(entraGroups, { fields: [userGroupMemberships.groupId], references: [entraGroups.id] }),
}));

export const groupRoleMappings = pgTable(
  "group_role_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => entraGroups.id, { onDelete: "cascade" }),
    targetType: mappingTargetType("target_type").notNull(),
    /** space id or module id depending on targetType; null for platform_role */
    targetId: uuid("target_id"),
    role: text("role").notNull(),
    ...timestamps,
  },
  (t) => [index("group_role_mappings_group_idx").on(t.groupId)],
);

/**
 * Top-level workspace apps in the sidebar (Tasks, Accounts, …).
 * Each owns its own spaces → lists → tasks tree via spaces.module_id.
 */
export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** Lucide icon key used in the sidebar, e.g. "tasks" | "building" | "users" */
    icon: text("icon").notNull().default("tasks"),
    color: text("color"),
    /** Sort order in the sidebar (lexicographic fractional index). */
    position: text("position").notNull().default("a0"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    /** System modules (e.g. tasks) cannot be deleted. */
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("modules_position_idx").on(t.position)],
);

/**
 * Workspace roles for the Security & Permissions matrix.
 * System roles (guest / member / owner) map to existing space_role enum values.
 * Custom roles are admin-defined; assignment to members can use slug later.
 */
export const permissionRoles = pgTable(
  "permission_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** System roles cannot be deleted; permissions are still editable. */
    isSystem: boolean("is_system").notNull().default(false),
    /** Column order in the permissions matrix */
    position: text("position").notNull().default("a0"),
    /**
     * Map of permission key → enabled.
     * Keys are defined in the app permission catalog.
     */
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [index("permission_roles_position_idx").on(t.position)],
);

/** Persisted Graph delta links & job bookkeeping */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Enterprise audit trail (ClickUp-style).
 * Separate from task `activity_log` (in-app feed). Append-only for compliance review.
 *
 * Categories: user | task | fields | hierarchy | agents | other
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** ClickUp-style top-level filter bucket */
    category: text("category").notNull(),
    /** Stable machine key e.g. USER_LOGIN, TASK_CREATED */
    eventType: text("event_type").notNull(),
    /** success | failure | denied */
    eventStatus: text("event_status").notNull().default("success"),
    /** Human title e.g. "User Login" */
    title: text("title").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    actorName: text("actor_name"),
    /** super_admin | admin | member | guest | system */
    actorRole: text("actor_role"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    spaceId: uuid("space_id"),
    taskId: uuid("task_id"),
    clientIp: text("client_ip"),
    clientAgent: text("client_agent"),
    /** Full structured event (authPath, eventContext, …) */
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_category_created_idx").on(t.category, t.createdAt),
    index("audit_logs_actor_created_idx").on(t.actorId, t.createdAt),
    index("audit_logs_event_type_idx").on(t.eventType),
  ],
);
