/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Permission catalog for Security & Permissions.
 * Only actions that exist (or will exist) in this intranet.
 */

export type PermissionKey =
  // Manage
  | "manage_users"
  | "manage_groups"
  | "manage_roles"
  | "manage_space_members"
  | "manage_list_members"
  | "manage_trash"
  // Structure
  | "create_spaces"
  | "create_lists"
  | "create_folders"
  | "create_views"
  // Tasks
  | "create_tasks"
  | "edit_tasks"
  | "comment"
  | "manage_attachments"
  | "manage_statuses"
  | "manage_tags"
  // Docs / knowledge
  | "create_docs"
  | "edit_docs"
  | "manage_docs"
  // Custom fields
  | "manage_custom_fields"
  | "create_custom_fields"
  | "edit_custom_fields"
  // Destructive
  | "delete_items"
  | "delete_own_only"
  // Export
  | "export_views";

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
};

export type PermissionGroup = {
  id: string;
  label: string;
  permissions: PermissionDef[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "manage",
    label: "Manage",
    permissions: [
      {
        key: "manage_users",
        label: "Manage users",
        description:
          "View and manage all users on the platform. Includes activating/deactivating accounts and viewing directory admin tools.",
      },
      {
        key: "manage_groups",
        label: "Manage groups & mappings",
        description:
          "Manage Entra group catalog mappings to platform and space roles.",
      },
      {
        key: "manage_roles",
        label: "Custom roles",
        description:
          "Create, edit, delete, and manage custom roles and their permissions. Platform admins always retain this ability.",
      },
      {
        key: "manage_space_members",
        label: "Manage space members",
        description:
          "Add and remove people from a space and change their space roles (sharing & permissions).",
      },
      {
        key: "manage_list_members",
        label: "Manage list members",
        description:
          "Share lists, change list-level privacy, and manage list member roles.",
      },
      {
        key: "manage_trash",
        label: "Manage Trash",
        description:
          "View, restore, and permanently delete trashed spaces, folders, lists, and tasks across every space — even ones this role doesn't otherwise administer. Space Admins and Super Admins already have this for spaces they own; this grants it independently.",
      },
    ],
  },
  {
    id: "structure",
    label: "Spaces & structure",
    permissions: [
      {
        key: "create_spaces",
        label: "Create spaces",
        description: "Create new top-level spaces in Tasks.",
      },
      {
        key: "create_lists",
        label: "Create lists",
        description: "Create lists inside a space or folder.",
      },
      {
        key: "create_folders",
        label: "Create folders",
        description: "Create folders and subfolders in a space.",
      },
      {
        key: "create_views",
        label: "Create views",
        description: "Create and edit list views (table, board, filters).",
      },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    permissions: [
      {
        key: "create_tasks",
        label: "Create tasks",
        description: "Create new tasks in lists the user can access.",
      },
      {
        key: "edit_tasks",
        label: "Edit tasks",
        description:
          "Edit task title, description, status, priority, dates, assignees, and custom field values.",
      },
      {
        key: "comment",
        label: "Comment",
        description: "Add comments and replies on tasks.",
      },
      {
        key: "manage_attachments",
        label: "Manage attachments",
        description:
          "Upload, organize, move, and delete task attachments and attachment folders.",
      },
      {
        key: "manage_statuses",
        label: "Edit statuses",
        description:
          "Create, edit, reorder, and delete list statuses. Deleting also requires Delete items.",
      },
      {
        key: "manage_tags",
        label: "Manage tags",
        description:
          "Create, edit, and delete space tags. Deleting also requires Delete items.",
      },
    ],
  },
  {
    id: "docs",
    label: "Docs",
    permissions: [
      {
        key: "create_docs",
        label: "Create pages",
        description:
          "Create knowledge pages and wikis in spaces the user can access.",
      },
      {
        key: "edit_docs",
        label: "Edit pages",
        description:
          "Edit page titles and content (unless the page is protected).",
      },
      {
        key: "manage_docs",
        label: "Manage pages",
        description:
          "Protect/unprotect pages, change owner, verify freshness, move, and trash pages.",
      },
    ],
  },
  {
    id: "custom_fields",
    label: "Custom fields",
    permissions: [
      {
        key: "manage_custom_fields",
        label: "Manage custom fields",
        description:
          "Full control over custom field definitions (create, edit, archive/delete). Deleting also requires Delete items.",
      },
      {
        key: "create_custom_fields",
        label: "Create custom fields",
        description: "Create new custom field definitions on lists.",
      },
      {
        key: "edit_custom_fields",
        label: "Edit custom fields",
        description: "Change custom field name, type options, and settings.",
      },
    ],
  },
  {
    id: "delete",
    label: "Delete",
    permissions: [
      {
        key: "delete_items",
        label: "Delete items",
        description:
          "Delete tasks, lists, folders, statuses, tags, custom fields, and attachments where allowed by other permissions.",
      },
      {
        key: "delete_own_only",
        label: "Delete own tasks only",
        description:
          "When Delete items is off, still allow deleting tasks the user created. Ignored if Delete items is on.",
      },
    ],
  },
  {
    id: "export",
    label: "Export",
    permissions: [
      {
        key: "export_views",
        label: "Export views",
        description: "Export list data (e.g. CSV) from table and other views.",
      },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

/**
 * Defaults for space membership roles (permission matrix columns).
 *
 * Internal slug `owner` is displayed as **Admin** — highest configurable space role.
 * Platform Super Admin (god mode) is separate and not in this matrix.
 */
export const SYSTEM_ROLE_DEFAULTS: Record<
  "guest" | "member" | "owner",
  { name: string; description: string; position: string; permissions: PermissionMap }
> = {
  guest: {
    name: "Guest",
    description: "Can view and comment on tasks they can access. Limited create/edit.",
    position: "a0",
    permissions: {
      manage_users: false,
      manage_groups: false,
      manage_roles: false,
      manage_space_members: false,
      manage_list_members: false,
      manage_trash: false,
      create_spaces: false,
      create_lists: false,
      create_folders: false,
      create_views: false,
      create_tasks: false,
      edit_tasks: false,
      comment: true,
      manage_attachments: false,
      manage_statuses: false,
      manage_tags: false,
      create_docs: false,
      edit_docs: false,
      manage_docs: false,
      manage_custom_fields: false,
      create_custom_fields: false,
      edit_custom_fields: false,
      delete_items: false,
      delete_own_only: false,
      export_views: false,
    },
  },
  member: {
    name: "Member",
    description: "Can work on tasks, create content, and manage their day-to-day work.",
    position: "a1",
    permissions: {
      manage_users: false,
      manage_groups: false,
      manage_roles: false,
      manage_space_members: false,
      manage_list_members: false,
      manage_trash: false,
      create_spaces: false,
      create_lists: false,
      create_folders: false,
      create_views: true,
      create_tasks: true,
      edit_tasks: true,
      comment: true,
      manage_attachments: true,
      manage_statuses: false,
      manage_tags: true,
      create_docs: true,
      edit_docs: true,
      manage_docs: false,
      manage_custom_fields: false,
      create_custom_fields: false,
      edit_custom_fields: false,
      delete_items: false,
      delete_own_only: true,
      export_views: true,
    },
  },
  owner: {
    name: "Admin",
    description:
      "Space admin — full control of a space: members, structure, statuses, and fields. " +
      "Not the same as Super Admin (platform god mode).",
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
      delete_own_only: true,
      export_views: true,
    },
  },
};

export function emptyPermissionMap(): PermissionMap {
  const map: PermissionMap = {};
  for (const key of ALL_PERMISSION_KEYS) map[key] = false;
  return map;
}

export function normalizePermissionMap(input: unknown): PermissionMap {
  const base = emptyPermissionMap();
  if (!input || typeof input !== "object") return base;
  const obj = input as Record<string, unknown>;
  for (const key of ALL_PERMISSION_KEYS) {
    const val = obj[key];
    if (typeof val === "boolean") base[key] = val;
  }
  return base;
}
