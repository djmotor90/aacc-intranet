"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EntityIcon } from "./entity-icon";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskTable } from "./task-table";
import type { FolderNavNode, ListNavNode, TaskTypeMeta, TaskWithMeta } from "../queries";
import { cn } from "@/lib/utils";

export type StackedListBundle = {
  list: ListNavNode;
  items: TaskWithMeta[];
  total: number;
  groupCounts: { key: string; count: number }[] | null;
  statuses: { id: string; name: string; color: string; category?: string }[];
  fieldDefs: {
    id: string;
    key: string;
    label: string;
    type: string;
    options: unknown;
    optionColorDisplay?: string | null;
    isRequired: boolean;
  }[];
  canEdit: boolean;
};

export function StackedListsView({
  spaceName,
  spaceSlug,
  title,
  icon,
  color,
  fallbackIcon = "folder",
  description,
  crumbs,
  folders,
  lists,
  bundles,
  activeUsers,
  spaceTags,
  writableLists,
  taskTypes,
  currentUserId,
  headerActions,
}: {
  spaceName: string;
  spaceSlug: string;
  title: string;
  icon: string | null;
  color: string | null;
  fallbackIcon?: "folder" | "space";
  description?: string | null;
  crumbs: { href: string; label: string }[];
  folders: FolderNavNode[];
  lists: ListNavNode[];
  bundles: StackedListBundle[];
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: { id: string; name: string; color: string }[];
  writableLists: {
    id: string;
    name: string;
    slug: string;
    spaceId: string;
    spaceName: string;
    spaceSlug: string;
  }[];
  taskTypes: TaskTypeMeta[];
  currentUserId: string;
  headerActions?: ReactNode;
}) {
  const bundleById = useMemo(() => new Map(bundles.map((b) => [b.list.id, b])), [bundles]);
  const userNames = useMemo(
    () => new Map(activeUsers.map((u) => [u.id, u.displayName])),
    [activeUsers],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              <Link href={crumb.href} className="hover:underline">
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <EntityIcon icon={icon} color={color} fallback={fallbackIcon} size="md" />
              {title}
            </h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {headerActions}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {lists.flatMap((list) => {
          const bundle = bundleById.get(list.id);
          if (!bundle) return [];
          return [
            <StackedListSection
              key={list.id}
              bundle={bundle}
              spaceSlug={spaceSlug}
              userNames={userNames}
              activeUsers={activeUsers}
              spaceTags={spaceTags}
              writableLists={writableLists}
              taskTypes={taskTypes}
              currentUserId={currentUserId}
            />,
          ];
        })}
        {folders.map((folder) => (
          <FolderBlock
            key={folder.id}
            folder={folder}
            spaceName={spaceName}
            spaceSlug={spaceSlug}
            bundleById={bundleById}
            userNames={userNames}
            activeUsers={activeUsers}
            spaceTags={spaceTags}
            writableLists={writableLists}
            taskTypes={taskTypes}
            currentUserId={currentUserId}
          />
        ))}
        {lists.length === 0 && folders.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No lists here yet.
          </p>
        )}
      </div>
    </div>
  );
}

function FolderBlock({
  folder,
  spaceName,
  spaceSlug,
  bundleById,
  userNames,
  activeUsers,
  spaceTags,
  writableLists,
  taskTypes,
  currentUserId,
}: {
  folder: FolderNavNode;
  spaceName: string;
  spaceSlug: string;
  bundleById: Map<string, StackedListBundle>;
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: { id: string; name: string; color: string }[];
  writableLists: {
    id: string;
    name: string;
    slug: string;
    spaceId: string;
    spaceName: string;
    spaceSlug: string;
  }[];
  taskTypes: TaskTypeMeta[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          aria-expanded={open}
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Link
          href={`/tasks/${spaceSlug}/folder/${folder.slug}`}
          className="flex min-w-0 items-center gap-2 font-semibold hover:underline"
        >
          <EntityIcon icon={folder.icon} color={folder.color} fallback="folder" size="sm" />
          <span className="truncate">{folder.name}</span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {spaceName}
        </span>
      </div>
      {open && (
        <div className="flex flex-col gap-4 p-3">
          {folder.lists.flatMap((list) => {
            const bundle = bundleById.get(list.id);
            if (!bundle) return [];
            return [
              <StackedListSection
                key={list.id}
                bundle={bundle}
                spaceSlug={spaceSlug}
                userNames={userNames}
                activeUsers={activeUsers}
                spaceTags={spaceTags}
                writableLists={writableLists}
                taskTypes={taskTypes}
                currentUserId={currentUserId}
              />,
            ];
          })}
          {folder.subfolders.map((sub) => (
            <FolderBlock
              key={sub.id}
              folder={sub}
              spaceName={spaceName}
              spaceSlug={spaceSlug}
              bundleById={bundleById}
              userNames={userNames}
              activeUsers={activeUsers}
              spaceTags={spaceTags}
              writableLists={writableLists}
              taskTypes={taskTypes}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StackedListSection({
  bundle,
  spaceSlug,
  userNames,
  activeUsers,
  spaceTags,
  writableLists,
  taskTypes,
  currentUserId,
}: {
  bundle: StackedListBundle;
  spaceSlug: string;
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: { id: string; name: string; color: string }[];
  writableLists: {
    id: string;
    name: string;
    slug: string;
    spaceId: string;
    spaceName: string;
    spaceSlug: string;
  }[];
  taskTypes: TaskTypeMeta[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(true);
  const { list } = bundle;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-expanded={open}
              aria-label={open ? `Collapse ${list.name}` : `Expand ${list.name}`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <Link
              href={`/tasks/${spaceSlug}/${list.slug}`}
              className={cn("flex min-w-0 items-center gap-2 font-semibold hover:underline")}
            >
              <EntityIcon icon={list.icon} color={list.color} fallback="list" size="sm" />
              <span className="truncate">{list.name}</span>
            </Link>
          </div>
          {list.description && <p className="mt-1 pl-8 text-sm text-muted-foreground">{list.description}</p>}
        </div>
        {bundle.canEdit && (
          <NewTaskDialog listId={list.id} fieldDefs={bundle.fieldDefs} users={activeUsers} spaceTags={spaceTags} />
        )}
      </div>
      {open && (
        <div className="border-t border-border px-1 pb-2">
          <TaskTable
            items={bundle.items}
            totalCount={bundle.total}
            groupCounts={bundle.groupCounts}
            statuses={bundle.statuses}
            fieldDefs={bundle.fieldDefs}
            userNames={userNames}
            activeUsers={activeUsers}
            writableLists={writableLists}
            taskTypes={taskTypes}
            groupBy="status"
            listId={list.id}
            canEdit={bundle.canEdit}
            spaceTags={spaceTags}
            currentUserId={currentUserId}
            fillViewport={false}
          />
        </div>
      )}
    </section>
  );
}
